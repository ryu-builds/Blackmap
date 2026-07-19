/**
 * Semantic search — embeds a query and retrieves ranked chunks from the
 * vector store. Returns results with score, source location, and a
 * formatted context block ready for injection into an LLM prompt.
 */

import type { EmbeddingProvider } from "./embeddings/base.js";
import { getOrCreateStore, type SearchResult } from "./vector-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  /** Maximum number of results to return. Default: 8. */
  topK?: number;
  /** Minimum cosine-similarity score (0-1). Default: 0.0 (return all). */
  minScore?: number;
  /** If provided, only return results for these file paths. */
  filterPaths?: string[];
  /** If provided, only return results for these languages. */
  filterLanguages?: string[];
}

export interface RankedResult extends SearchResult {
  /** 1-indexed rank in this result set. */
  rank: number;
}

export interface SearchResponse {
  query: string;
  results: RankedResult[];
  /** Pre-formatted context block for injection into an LLM prompt. */
  contextBlock: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function semanticSearch(
  jobId: string,
  query: string,
  embeddingProvider: EmbeddingProvider,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const { topK = 8, minScore = 0.0, filterPaths, filterLanguages } = options;
  const started = Date.now();

  const queryVector = await embeddingProvider.embed(query);
  const store = await getOrCreateStore(jobId, embeddingProvider.dimensions);
  let raw = await store.search(queryVector, topK * 2, minScore); // over-fetch then filter

  // Apply optional filters
  if (filterPaths?.length) {
    raw = raw.filter((r) => filterPaths.includes(r.chunk.filePath));
  }
  if (filterLanguages?.length) {
    raw = raw.filter((r) => filterLanguages.includes(r.chunk.language));
  }

  const results: RankedResult[] = raw
    .slice(0, topK)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    query,
    results,
    contextBlock: buildContextBlock(results),
    durationMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Context block builder
// ---------------------------------------------------------------------------

/**
 * Formats search results into a compact context block for LLM injection.
 * Each chunk is labelled with its file path and line range so the model
 * can cite sources precisely.
 */
export function buildContextBlock(results: RankedResult[]): string {
  if (results.length === 0) {
    return "No relevant code found for this query.";
  }

  const sections = results.map((r) => {
    const { filePath, startLine, endLine, language, rawLines } = r.chunk;
    const header = `[${r.rank}] ${filePath} (lines ${startLine}–${endLine}, ${language}, score: ${r.score.toFixed(3)})`;
    return `${header}\n\`\`\`${language}\n${rawLines}\n\`\`\``;
  });

  return [
    `Retrieved ${results.length} relevant code section(s):`,
    "",
    sections.join("\n\n"),
  ].join("\n");
}
