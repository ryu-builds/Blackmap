/**
 * RAGService — public facade for the retrieval-augmented generation layer.
 *
 * Responsibilities:
 *  - Index a completed job's repository.
 *  - Delete an index.
 *  - Search an index semantically.
 *  - Answer questions with RAG (retrieve chunks → inject into LLM prompt).
 *
 * Does NOT modify any existing AI or engine modules.
 */

import { indexRepository, type IndexResult } from "./indexer.js";
import { semanticSearch, type SearchResponse, type SearchOptions } from "./search.js";
import { getOrCreateStore, evictStore } from "./vector-store.js";
import { createEmbeddingProvider } from "./embeddings/factory.js";
import { EmbeddingNotConfiguredError } from "./embeddings/base.js";
import { createProvider } from "../ai/providers/factory.js";
import { ProviderNotConfiguredError } from "../ai/providers/base.js";
import { jobStore, resultStore, settingsStore } from "../store/index.js";
import { sessionStore } from "../ai/chat/session.js";
import type { ChatMessage } from "../ai/providers/base.js";
import { existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class RAGServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "RAGServiceError";
  }
}

// ---------------------------------------------------------------------------
// In-memory index metadata (what provider/dims was used per job)
// ---------------------------------------------------------------------------

interface IndexMeta {
  jobId: string;
  embeddingProviderId: string;
  dimensions: number;
  indexedAt: string;
  lastResult: IndexResult;
  /** Temp dir path — only valid during an active index run. */
  repoDir?: string;
}

const indexRegistry = new Map<string, IndexMeta>();

// ---------------------------------------------------------------------------
// RAGService
// ---------------------------------------------------------------------------

export const RAGService = {

  // ── Indexing ─────────────────────────────────────────────────────────

  /**
   * Index a completed job.
   *
   * IMPORTANT: the engine deletes the repo temp-dir after the analysis job
   * completes. This means full indexing from the original files is only
   * possible if called with a live repoDir (e.g. during analysis, or if
   * the caller provides one explicitly).
   *
   * For post-hoc indexing of already-completed jobs, the content embedded
   * is the full list of file paths + the raw file content stored in
   * RepoIntelligence (currently only metadata, not raw bytes). In that
   * scenario, the indexer generates chunks from whatever content is
   * available.
   *
   * repoDir parameter: caller supplies the temp dir path while it is still
   * live. Routes expose this via the request body.
   */
  async indexJob(jobId: string, repoDir?: string): Promise<{
    started: boolean;
    jobId: string;
    embeddingProvider: string;
  }> {
    const job = jobStore.get(jobId);
    if (!job) throw new RAGServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    if (job.status !== "completed") {
      throw new RAGServiceError(
        `Job "${jobId}" must be completed before indexing.`,
        "job_not_completed",
        409
      );
    }

    const result = resultStore.get(jobId);
    if (!result?.repoIntelligence) {
      throw new RAGServiceError(
        `No repository intelligence available for job "${jobId}".`,
        "no_intelligence",
        422
      );
    }

    const settings = settingsStore.get();
    let embeddingProvider;
    try {
      embeddingProvider = createEmbeddingProvider(settings);
    } catch (err) {
      if (err instanceof EmbeddingNotConfiguredError) {
        throw new RAGServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    const filePaths = result.repoIntelligence.fileTree;
    const effectiveRepoDir = repoDir ?? "";

    // Fire and forget
    (async () => {
      try {
        let indexResult: IndexResult;

        if (effectiveRepoDir && existsSync(effectiveRepoDir)) {
          indexResult = await indexRepository({
            jobId,
            repoDir: effectiveRepoDir,
            filePaths,
            embeddingProvider,
            onProgress: (n, t, f) => {
              if (n % 50 === 0 || n === t) {
                console.log(`[RAG] ${jobId}: ${n}/${t} files indexed (last: ${f})`);
              }
            },
          });
        } else {
          // Post-hoc: we don't have the raw files; index file-path strings
          // as placeholder chunks so search at least returns file references.
          console.warn(`[RAG] ${jobId}: no repoDir — indexing file-path strings only.`);
          const { reindexFiles } = await import("./indexer.js");
          const fileContents = filePaths.map((p) => ({
            relativePath: p,
            content: `File: ${p}\n(source not available — index was built without live repo dir)`,
          }));
          indexResult = await reindexFiles(jobId, fileContents, embeddingProvider);
        }

        indexRegistry.set(jobId, {
          jobId,
          embeddingProviderId: embeddingProvider.id,
          dimensions: embeddingProvider.dimensions,
          indexedAt: new Date().toISOString(),
          lastResult: indexResult,
        });

        console.log(
          `[RAG] ${jobId}: indexing complete — ${indexResult.insertedChunks} chunks inserted, ` +
          `${indexResult.skippedChunks} skipped, ${indexResult.durationMs}ms`
        );
      } catch (err) {
        console.error(`[RAG] Indexing failed for job ${jobId}:`, err);
      }
    })();

    return {
      started: true,
      jobId,
      embeddingProvider: embeddingProvider.name,
    };
  },

  // ── Delete ───────────────────────────────────────────────────────────

  async deleteIndex(jobId: string): Promise<void> {
    const job = jobStore.get(jobId);
    if (!job) throw new RAGServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);

    const meta = indexRegistry.get(jobId);
    if (meta) {
      const store = await getOrCreateStore(jobId, meta.dimensions);
      await store.deleteAll();
      evictStore(jobId);
      indexRegistry.delete(jobId);
    }
  },

  // ── Search ───────────────────────────────────────────────────────────

  async search(jobId: string, query: string, options?: SearchOptions): Promise<SearchResponse> {
    if (!jobStore.get(jobId)) {
      throw new RAGServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }

    const settings = settingsStore.get();
    const embeddingProvider = createEmbeddingProvider(settings);
    return semanticSearch(jobId, query, embeddingProvider, options);
  },

  // ── Stats ────────────────────────────────────────────────────────────

  async getStats(jobId: string): Promise<{
    jobId: string;
    indexed: boolean;
    meta: IndexMeta | null;
    storeStats: Awaited<ReturnType<import("./vector-store.js").VectorStore["stats"]>> | null;
  }> {
    if (!jobStore.get(jobId)) {
      throw new RAGServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }

    const meta = indexRegistry.get(jobId) ?? null;
    if (!meta) return { jobId, indexed: false, meta: null, storeStats: null };

    const store = await getOrCreateStore(jobId, meta.dimensions);
    const storeStats = await store.stats();
    return { jobId, indexed: true, meta, storeStats };
  },

  // ── RAG Chat ─────────────────────────────────────────────────────────

  /**
   * RAG-augmented chat: retrieves relevant chunks for the question,
   * injects only those chunks as context, never sends the full repository.
   *
   * Uses the AI provider from settings (same as the regular chat), but
   * builds the system message from retrieved chunks rather than the full
   * RepoIntelligence.
   */
  async ragChat(
    jobId: string,
    message: string,
    topK = 8
  ): Promise<{ reply: string; sources: SearchResponse["results"]; retrievalMs: number }> {
    if (!jobStore.get(jobId)) {
      throw new RAGServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }

    const settings = settingsStore.get();

    // Embedding provider for retrieval
    let embeddingProvider;
    try {
      embeddingProvider = createEmbeddingProvider(settings);
    } catch (err) {
      if (err instanceof EmbeddingNotConfiguredError) {
        throw new RAGServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    // LLM provider for generation
    let llmProvider;
    try {
      llmProvider = createProvider(settings);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        throw new RAGServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    // Retrieve relevant chunks
    const searchResponse = await semanticSearch(jobId, message, embeddingProvider, { topK });
    const retrievalMs = searchResponse.durationMs;

    // Build the RAG prompt — only retrieved context, not the full repo
    const session = sessionStore.get(jobId);
    const recentTurns = session.turns.slice(-10); // shorter history for RAG

    const systemMessage: ChatMessage = {
      role: "system",
      content: [
        "You are an expert code analyst. You answer questions about a software repository",
        "using ONLY the code snippets retrieved below. Cite file paths and line numbers",
        "in your answers. If the retrieved context doesn't contain enough information to",
        "answer, say so explicitly — do not guess or hallucinate code.",
        "",
        "Retrieved context:",
        searchResponse.contextBlock,
      ].join("\n"),
    };

    const messages: ChatMessage[] = [
      systemMessage,
      ...recentTurns.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
      { role: "user", content: message },
    ];

    const reply = await llmProvider.complete(messages, { maxTokens: 2048, temperature: 0.2 });

    // Persist to chat session so history is shared with regular chat
    sessionStore.append(jobId, "user", message);
    sessionStore.append(jobId, "assistant", reply);

    return {
      reply,
      sources: searchResponse.results,
      retrievalMs,
    };
  },
};
