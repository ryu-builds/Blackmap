import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { ProviderNotConfiguredError, type AIProvider } from "./base.js";
import type { AppSettings } from "../../store/index.js";

/**
 * Create the correct AIProvider instance from the current app settings.
 * Throws ProviderNotConfiguredError if no provider or API key is available.
 *
 * Adding a new provider:
 *   1. Implement AIProvider in a new file in this directory.
 *   2. Add a case to the switch below.
 *   3. No other files need to change.
 */
export function createProvider(settings: AppSettings): AIProvider {
  const providerId = settings.activeProvider;
  if (!providerId) {
    throw new ProviderNotConfiguredError(
      "No AI provider selected. Configure one in Settings → AI Providers."
    );
  }

  const apiKey = settings.apiKeys[providerId];
  if (!apiKey) {
    throw new ProviderNotConfiguredError(
      `No API key set for provider "${providerId}". Add one in Settings → AI Providers.`
    );
  }

  switch (providerId) {
    case "openai":
      return new OpenAIProvider(apiKey);

    case "anthropic":
      return new AnthropicProvider(apiKey);

    case "gemini":
      return new GeminiProvider(apiKey);

    default:
      throw new ProviderNotConfiguredError(
        `Unknown provider id "${providerId}". Supported providers: openai, anthropic, gemini.`
      );
  }
}

/** List all provider IDs that are registered (regardless of configuration). */
export const REGISTERED_PROVIDER_IDS = ["openai", "anthropic", "gemini"] as const;
export type RegisteredProviderId = (typeof REGISTERED_PROVIDER_IDS)[number];
