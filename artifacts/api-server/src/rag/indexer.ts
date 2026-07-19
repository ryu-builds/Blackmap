/**
 * Repository indexer.
 *
 * Reads the files collected by the engine (via the walker output stored in
 * RepoIntelligence.fileTree) from the temp directory that was created
 * during analysis, then:
 *
 *   1. Reads each text file.
 *   2. Computes its SHA-256 hash.
 *   3. Skips unchanged files (incremental indexing).
 *   4. Chunks new/modified files.
 *   5. Embeds chunks in batches.
 *   6. Upserts into the vector store.
 *
 * The file list is taken from RepoIntelligence so the indexer never has
 * to re-walk the filesystem itself, and respects the same ignore rules
 * as the engine.
 *
 * Because the engine deletes the temp directory after analysis completes,
 * the indexer must be called BEFORE the job's temp dir is cleaned up.
 * For post-hoc indexing of already-completed jobs the caller must provide
 * a pre-existing directory path or a list of (path, content) pairs.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { EmbeddingProvider } from "./embeddings/base.js";
import { chunkFile, hashFileContent, type Chunk, type ChunkOptions } from "./chunker.js";
import { getOrCreateStore } from "./vector-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IndexInput {
  jobId: string;
  /** Absolute path to the checked-out / extracted repository root. */
  repoDir: string;
  /** File paths relative to repoDir (from RepoIntelligence.fileTree). */
  filePaths: string[];
  embeddingProvider: EmbeddingProvider;
  chunkOptions?: ChunkOptions;
  /** Max files to index (safety cap). Default: 5000. */
  maxFiles?: number;
  /** Max file size in bytes to embed. Default: 256 KB. */
  maxFileSizeBytes?: number;
  /** Embedding batch size. Default: 32. */
  embeddingBatchSize?: number;
  onProgress?: (indexed: number, total: number, file: string) => void;
}

export interface IndexResult {
  jobId: string;
  totalFiles: number;
  indexedFiles: number;
  skippedFiles: number;   // unchanged (hash match)
  errorFiles: number;
  totalChunks: number;
  insertedChunks: number;
  skippedChunks: number;
  durationMs: number;
}

// File extensions we'll attempt to read as text
const TEXT_EXTENSIONS = new Set([
  "ts","tsx","js","jsx","mjs","cjs","py","go","rs","java","kt","rb","php",
  "cs","cpp","cc","c","h","swift","sh","bash","zsh","yaml","yml","json",
  "toml","md","txt","sql","html","htm","css","scss","less","vue","svelte",
  "graphql","gql","proto","xml","env","gitignore","dockerignore","makefile",
  "dockerfile","lock","cfg","ini","conf","config",
]);

function isTextFile(filePath: string): boolean {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  // Exact name matches (no extension)
  if (["makefile","dockerfile","gemfile","rakefile","procfile"].includes(name)) return true;
  const ext = name.split(".").pop() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Main indexer
// ---------------------------------------------------------------------------

export async function indexRepository(input: IndexInput): Promise<IndexResult> {
  const {
    jobId,
    repoDir,
    filePaths,
    embeddingProvider,
    chunkOptions,
    maxFiles = 5000,
    maxFileSizeBytes = 256 * 1024,
    embeddingBatchSize = 32,
    onProgress,
  } = input;

  const started = Date.now();
  const store = await getOrCreateStore(jobId, embeddingProvider.dimensions);

  const eligible = filePaths
    .filter(isTextFile)
    .slice(0, maxFiles);

  let indexedFiles = 0;
  let skippedFiles = 0;
  let errorFiles = 0;
  let totalChunks = 0;
  let insertedChunks = 0;
  let skippedChunks = 0;

  // Accumulate chunks and vectors for batch upsert
  let pendingChunks: Chunk[] = [];
  let pendingTexts: string[] = [];

  async function flush() {
    if (pendingChunks.length === 0) return;
    // Embed the accumulated texts
    const vectors = await embeddingProvider.embedBatch(pendingTexts);
    const result = await store.upsertChunks(pendingChunks, vectors);
    insertedChunks += result.inserted;
    skippedChunks += result.skipped;
    pendingChunks = [];
    pendingTexts = [];
  }

  for (let i = 0; i < eligible.length; i++) {
    const relPath = eligible[i];
    const absPath = join(repoDir, relPath);
    onProgress?.(i, eligible.length, relPath);

    try {
      if (!existsSync(absPath)) { errorFiles++; continue; }

      const buf = await readFile(absPath);
      if (buf.byteLength > maxFileSizeBytes) { skippedFiles++; continue; }

      const content = buf.toString("utf-8");
      const hash = hashFileContent(content);

      // Fast path: skip unchanged files
      if (!store.isFileChanged(relPath, hash)) {
        skippedFiles++;
        continue;
      }

      const chunks = chunkFile(jobId, relPath, content, chunkOptions);
      if (chunks.length === 0) { skippedFiles++; continue; }

      totalChunks += chunks.length;
      pendingChunks.push(...chunks);
      pendingTexts.push(...chunks.map((c) => c.content));
      indexedFiles++;

      // Flush when batch is full
      if (pendingTexts.length >= embeddingBatchSize) {
        await flush();
      }
    } catch (err) {
      console.error(`[indexer] Error processing ${relPath}:`, err);
      errorFiles++;
    }
  }

  // Final flush
  await flush();

  onProgress?.(eligible.length, eligible.length, "done");

  return {
    jobId,
    totalFiles: eligible.length,
    indexedFiles,
    skippedFiles,
    errorFiles,
    totalChunks,
    insertedChunks,
    skippedChunks,
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Incremental re-index: given a list of changed file paths + content pairs
// (caller is responsible for reading the files)
// ---------------------------------------------------------------------------

export interface FileContent {
  relativePath: string;
  content: string;
}

export async function reindexFiles(
  jobId: string,
  files: FileContent[],
  embeddingProvider: EmbeddingProvider,
  chunkOptions?: ChunkOptions
): Promise<IndexResult> {
  const started = Date.now();
  const store = await getOrCreateStore(jobId, embeddingProvider.dimensions);

  let indexedFiles = 0;
  let skippedFiles = 0;
  let insertedChunks = 0;
  let skippedChunks = 0;
  let totalChunks = 0;

  for (const { relativePath, content } of files) {
    const hash = hashFileContent(content);
    if (!store.isFileChanged(relativePath, hash)) {
      skippedFiles++;
      continue;
    }

    const chunks = chunkFile(jobId, relativePath, content, chunkOptions);
    if (chunks.length === 0) { skippedFiles++; continue; }

    totalChunks += chunks.length;
    const texts = chunks.map((c) => c.content);
    const vectors = await embeddingProvider.embedBatch(texts);
    const result = await store.upsertChunks(chunks, vectors);
    insertedChunks += result.inserted;
    skippedChunks += result.skipped;
    indexedFiles++;
  }

  return {
    jobId,
    totalFiles: files.length,
    indexedFiles,
    skippedFiles,
    errorFiles: 0,
    totalChunks,
    insertedChunks,
    skippedChunks,
    durationMs: Date.now() - started,
  };
}
