// ---------------------------------------------------------------------------
// Embedding provider abstraction
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  readonly id: string;
  readonly name: string;
  /** Number of dimensions in the output vectors. */
  readonly dimensions: number;

  /**
   * Embed a list of text strings.
   * Returns a parallel array of float vectors.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Convenience: embed a single string. */
  embed(text: string): Promise<number[]>;
}

export class EmbeddingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingNotConfiguredError";
  }
}

/** Cap batch size to avoid hitting provider limits. */
export const MAX_BATCH_SIZE = 96;

/**
 * Split an array into chunks of at most `size` elements and embed each,
 * then concatenate. Used by providers that batch internally.
 */
export async function batchEmbed(
  provider: EmbeddingProvider,
  texts: string[],
  batchSize = MAX_BATCH_SIZE
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const slice = texts.slice(i, i + batchSize);
    const vecs = await provider.embedBatch(slice);
    results.push(...vecs);
  }
  return results;
}
