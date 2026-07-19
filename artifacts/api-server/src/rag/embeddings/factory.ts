import { OpenAIEmbeddingProvider } from "./openai.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { LocalEmbeddingProvider } from "./local.js";
import { EmbeddingNotConfiguredError, type EmbeddingProvider } from "./base.js";
import type { AppSettings } from "../../store/index.js";

export type EmbeddingProviderId = "openai" | "gemini" | "local";

/**
 * Create an EmbeddingProvider from the current app settings.
 *
 * Resolution order:
 *   1. If activeProvider has an API key → use that provider's embedding model.
 *   2. If no key but provider is "local" → use the local model (no key needed).
 *   3. Otherwise, fall back to the local model for zero-config indexing.
 *
 * Adding a new embedding provider:
 *   1. Implement EmbeddingProvider in a new file.
 *   2. Add a case to the switch below.
 */
export function createEmbeddingProvider(
  settings: AppSettings,
  override?: EmbeddingProviderId
): EmbeddingProvider {
  const providerId = override ?? settings.activeProvider ?? "local";

  switch (providerId) {
    case "openai": {
      const key = settings.apiKeys["openai"];
      if (!key) {
        throw new EmbeddingNotConfiguredError(
          "OpenAI API key is required for OpenAI embeddings. Set it in Settings → AI Providers."
        );
      }
      return new OpenAIEmbeddingProvider(key);
    }

    case "anthropic":
      // Anthropic doesn't offer an embeddings API; fall back to local
      console.warn("[embeddings/factory] Anthropic has no embeddings API. Falling back to local model.");
      return new LocalEmbeddingProvider();

    case "gemini": {
      const key = settings.apiKeys["gemini"];
      if (!key) {
        throw new EmbeddingNotConfiguredError(
          "Gemini API key is required for Gemini embeddings. Set it in Settings → AI Providers."
        );
      }
      return new GeminiEmbeddingProvider(key);
    }

    case "local":
    default:
      return new LocalEmbeddingProvider();
  }
}

export const LOCAL_FALLBACK_DIMENSIONS = 384;
