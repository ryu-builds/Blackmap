// ---------------------------------------------------------------------------
// Provider abstraction — no provider-specific code leaks outside this dir
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  /** Target token ceiling for the response (best-effort hint per provider). */
  maxTokens?: number;
  /** Temperature 0–1; lower = more deterministic. */
  temperature?: number;
}

/**
 * Every AI provider implements this single interface.
 * Business logic never imports a concrete provider class — only this.
 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Send a list of messages and return the assistant's reply as a string.
   * Throws on network error, auth failure, or quota exhaustion.
   */
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}

// Sentinel error thrown when no provider is configured
export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}
