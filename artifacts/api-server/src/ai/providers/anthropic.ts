import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatMessage, CompletionOptions } from "./base.js";

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-3-5-sonnet-20241022") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    // Anthropic separates the system message from the conversation turns
    const systemMsg = messages.find((m) => m.role === "system");
    const turns = messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemMsg?.content,
      messages: turns.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const block = response.content[0];
    if (!block || block.type !== "text") throw new Error("Anthropic returned a non-text response");
    return block.text;
  }
}
