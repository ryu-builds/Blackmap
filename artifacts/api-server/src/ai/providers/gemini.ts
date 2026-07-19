import { GoogleGenAI } from "@google/genai";
import type { AIProvider, ChatMessage, CompletionOptions } from "./base.js";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";

  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    // Gemini expects a single contents string or structured turns.
    // We flatten all messages into a single prompt with role labels so
    // the system prompt and prior conversation are preserved.
    const systemMsg = messages.find((m) => m.role === "system");
    const turns = messages.filter((m) => m.role !== "system");

    // Build a history-aware prompt: system instruction + all turns
    const promptParts: string[] = [];
    if (systemMsg) promptParts.push(`[SYSTEM]\n${systemMsg.content}`);
    for (const t of turns) {
      const label = t.role === "user" ? "[USER]" : "[ASSISTANT]";
      promptParts.push(`${label}\n${t.content}`);
    }
    promptParts.push("[ASSISTANT]");
    const prompt = promptParts.join("\n\n");

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        maxOutputTokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned an empty response");
    return text;
  }
}
