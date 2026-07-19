/**
 * Vector store — backed by `vectra` (LocalIndex, file-backed, pure JS).
 *
 * One index per job, stored at STORAGE_ROOT/{jobId}/.
 *
 * To swap to Qdrant or another backend, replace only this file.
 * The public interface (upsertChunks, search, deleteForFile, deleteAll,
 * getStats) remains stable.
 */

import { LocalIndex, type QueryResult, type MetadataFilter } from "vectra";
import { join } from "path";
import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { Chunk } from "./chunker.js";

// ---------------------------------------------------------------------------
// Storage root
// ---------------------------------------------------------------------------

const STORAGE_ROOT = process.env.RAG_STORAGE_PATH ?? "/tmp/blackmap-rag";

function indexPath(jobId: string): string {
  return join(STORAGE_ROOT, sanitiseId(jobId));
}

function sanitiseId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ---------------------------------------------------------------------------
// File-hash registry (incremental indexing support)
// Stored alongside the vectra index as file-hashes.json
// ---------------------------------------------------------------------------

async function loadHashes(jobId: string): Promise<Map<string, string>> {
  const path = join(indexPath(jobId), "file-hashes.json");
  try {
    const raw = await readFile(path, "utf-8");
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

async function saveHashes(jobId: string, map: Map<string, string>): Promise<void> {
  const path = join(indexPath(jobId), "file-hashes.json");
  await writeFile(path, JSON.stringify(Object.fromEntries(map)), "utf-8");
}

// ---------------------------------------------------------------------------
// Chunk metadata shape stored in vectra
// ---------------------------------------------------------------------------

import type { MetadataTypes } from "vectra";

export interface ChunkMetadata extends Record<string, MetadataTypes> {
  id: string;
  jobId: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
  fileHash: string;
  rawLines: string;
}

// ---------------------------------------------------------------------------
// Search result shape returned to callers
// ---------------------------------------------------------------------------

export interface SearchResult {
  score: number;
  chunk: ChunkMetadata;
}

// ---------------------------------------------------------------------------
// VectorStore class
// ---------------------------------------------------------------------------

export class VectorStore {
  private index: LocalIndex;
  private jobId: string;
  private dimensions: number;
  private hashes: Map<string, string> = new Map();

  constructor(jobId: string, dimensions: number) {
    this.jobId = jobId;
    this.dimensions = dimensions;
    this.index = new LocalIndex(indexPath(jobId));
  }

  async init(): Promise<void> {
    const dir = indexPath(this.jobId);
    await mkdir(dir, { recursive: true });

    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({ version: 1, deleteIfExists: false });
    }
    this.hashes = await loadHashes(this.jobId);
  }

  // ── Incremental support ────────────────────────────────────────────────

  /** Returns true if the file has changed (hash mismatch or not seen before). */
  isFileChanged(filePath: string, newHash: string): boolean {
    return this.hashes.get(filePath) !== newHash;
  }

  /** Delete all vectors that belong to a specific file path. */
  async deleteChunksForFile(filePath: string): Promise<number> {
    const items = await this.index.listItems();
    const toDelete = items.filter(
      (it) => (it.metadata as unknown as ChunkMetadata).filePath === filePath
    );

    if (toDelete.length === 0) return 0;
    await this.index.beginUpdate();
    try {
      for (const item of toDelete) {
        await this.index.deleteItem(item.id ?? "");
      }
      await this.index.endUpdate();
    } catch (err) {
      await this.index.cancelUpdate();
      throw err;
    }
    this.hashes.delete(filePath);
    return toDelete.length;
  }

  // ── Upsert ─────────────────────────────────────────────────────────────

  /**
   * Insert or replace chunks for a batch of files.
   * Skips files whose hash hasn't changed.
   */
  async upsertChunks(
    chunks: Chunk[],
    vectors: number[][]
  ): Promise<{ inserted: number; skipped: number }> {
    if (chunks.length === 0) return { inserted: 0, skipped: 0 };

    // Group by file to handle per-file operations
    const byFile = new Map<string, { chunks: Chunk[]; vectors: number[][] }>();
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!byFile.has(c.filePath)) byFile.set(c.filePath, { chunks: [], vectors: [] });
      byFile.get(c.filePath)!.chunks.push(c);
      byFile.get(c.filePath)!.vectors.push(vectors[i]);
    }

    let inserted = 0;
    let skipped = 0;

    for (const [filePath, { chunks: fc, vectors: fv }] of byFile) {
      const fileHash = fc[0].fileHash;
      if (!this.isFileChanged(filePath, fileHash)) {
        skipped += fc.length;
        continue;
      }

      // Delete stale chunks for this file before re-inserting
      await this.deleteChunksForFile(filePath);

      await this.index.beginUpdate();
      try {
        for (let i = 0; i < fc.length; i++) {
          const c = fc[i];
          const meta: ChunkMetadata = {
            id: c.id,
            jobId: c.jobId,
            filePath: c.filePath,
            language: c.language,
            startLine: c.startLine,
            endLine: c.endLine,
            chunkIndex: c.chunkIndex,
            fileHash: c.fileHash,
            rawLines: c.rawLines,
          };
          await this.index.insertItem({
            id: c.id,
            vector: fv[i],
            metadata: meta as Record<string, MetadataTypes>,
          });
        }
        await this.index.endUpdate();
      } catch (err) {
        await this.index.cancelUpdate();
        throw err;
      }

      this.hashes.set(filePath, fileHash);
      inserted += fc.length;
    }

    await saveHashes(this.jobId, this.hashes);
    return { inserted, skipped };
  }

  // ── Search ─────────────────────────────────────────────────────────────

  async search(
    queryVector: number[],
    topK = 8,
    minScore = 0.0
  ): Promise<SearchResult[]> {
    const raw = await this.index.queryItems<ChunkMetadata>(
      queryVector,
      "",
      topK
  );
    return raw
      .filter((r) => r.score >= minScore)
      .map((r) => ({ score: r.score, chunk: r.item.metadata as ChunkMetadata }));
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  async stats(): Promise<{
    totalChunks: number;
    totalFiles: number;
    dimensions: number;
    storageDir: string;
    fileHashCount: number;
  }> {
    const items = await this.index.listItems();
    const files = new Set(
      items.map((it) => (it.metadata as unknown as ChunkMetadata).filePath));
    return {
      totalChunks: items.length,
      totalFiles: files.size,
      dimensions: this.dimensions,
      storageDir: indexPath(this.jobId),
      fileHashCount: this.hashes.size,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async deleteAll(): Promise<void> {
    const dir = indexPath(this.jobId);
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
    this.hashes.clear();
  }
}

// ---------------------------------------------------------------------------
// Registry — one VectorStore per job, keyed by jobId + dimensions
// (dimensions must match the embedding model used to build the index)
// ---------------------------------------------------------------------------

const registry = new Map<string, VectorStore>();

export function registryKey(jobId: string, dimensions: number): string {
  return `${jobId}:${dimensions}`;
}

export async function getOrCreateStore(
  jobId: string,
  dimensions: number
): Promise<VectorStore> {
  const key = registryKey(jobId, dimensions);
  if (!registry.has(key)) {
    const store = new VectorStore(jobId, dimensions);
    await store.init();
    registry.set(key, store);
  }
  return registry.get(key)!;
}

export function evictStore(jobId: string): void {
  for (const key of registry.keys()) {
    if (key.startsWith(`${jobId}:`)) registry.delete(key);
  }
}
