/**
 * Chat session manager — maintains per-job conversation history.
 *
 * Each job gets a dedicated session. The system message is rebuilt on
 * every request so it always reflects the latest generated reports.
 * User and assistant turns are stored in memory and prepended to each call.
 */

import type { AIProvider, ChatMessage } from "../providers/base.js";
import type { PromptContext } from "../prompts/context.js";
import type { AllReports } from "../reports/types.js";
import { chatSystemMessage } from "../prompts/templates.js";
import { reportStore } from "../reports/store.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  jobId: string;
  turns: ChatTurn[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// In-memory session store
// ---------------------------------------------------------------------------

const sessions = new Map<string, ChatSession>();

export const sessionStore = {
  get(jobId: string): ChatSession {
    if (!sessions.has(jobId)) {
      sessions.set(jobId, {
        jobId,
        turns: [],
        createdAt: new Date().toISOString(),
      });
    }
    return sessions.get(jobId)!;
  },

  append(jobId: string, role: "user" | "assistant", content: string): void {
    const session = sessionStore.get(jobId);
    session.turns.push({ role, content, timestamp: new Date().toISOString() });
  },

  clear(jobId: string): void {
    sessions.set(jobId, {
      jobId,
      turns: [],
      createdAt: new Date().toISOString(),
    });
  },

  delete(jobId: string): void {
    sessions.delete(jobId);
  },
};

// ---------------------------------------------------------------------------
// Send a message and get a response
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  jobId: string,
  userMessage: string,
  provider: AIProvider,
  ctx: PromptContext
): Promise<string> {
  // Build the full message list: system + history + new user message
  const reports = reportStore.get(jobId);

  const partialReports: Partial<AllReports> = reports
    ? {
        executiveSummary: reports.executiveSummary.data ? (reports.executiveSummary as any) : undefined,
        architecture: reports.architecture.data ? (reports.architecture as any) : undefined,
        folderWalkthrough: reports.folderWalkthrough.data ? (reports.folderWalkthrough as any) : undefined,
        onboarding: reports.onboarding.data ? (reports.onboarding as any) : undefined,
        dependencies: reports.dependencies.data ? (reports.dependencies as any) : undefined,
        risks: reports.risks.data ? (reports.risks as any) : undefined,
      }
    : {};

  const systemMsg = chatSystemMessage(ctx, partialReports);
  const session = sessionStore.get(jobId);

  // Limit history to last 20 turns to avoid token overflow
  const recentTurns = session.turns.slice(-20);

  const messages: ChatMessage[] = [
    systemMsg,
    ...recentTurns.map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  // Persist the user message before calling (so it's recorded even on failure)
  sessionStore.append(jobId, "user", userMessage);

  const reply = await provider.complete(messages, { maxTokens: 2048, temperature: 0.4 });

  sessionStore.append(jobId, "assistant", reply);
  return reply;
}
