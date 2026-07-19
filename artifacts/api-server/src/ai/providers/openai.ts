import OpenAI from "openai";
import type { AIProvider, ChatMessage, CompletionOptions } from "./base.js";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned an empty response");
    return content;
  }
}
