import { GoogleGenAI } from "@google/genai";
import type { EmbeddingProvider } from "./base.js";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id = "gemini";
  readonly name = "Gemini text-embedding-004";
  readonly dimensions = 768;

  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "text-embedding-004") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Gemini embedding API handles one text per call; parallelise with a
    // concurrency cap to avoid rate-limit bursts.
    const CONCURRENCY = 8;
    const results: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const slice = texts.slice(i, i + CONCURRENCY);
      const embeddings = await Promise.all(
        slice.map((text) =>
          this.ai.models
            .embedContent({ model: this.model, contents: text })
            .then((r) => r.embeddings?.[0]?.values ?? [])
        )
      );
      embeddings.forEach((vec, j) => {
        results[i + j] = vec;
      });
    }
    return results;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }
}
