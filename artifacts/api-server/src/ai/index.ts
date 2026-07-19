/**
 * AIService — the public facade for the AI analysis layer.
 *
 * All route handlers go through this. It validates preconditions
 * (job exists, is completed, has repoIntelligence), builds the
 * PromptContext, and delegates to the appropriate module.
 */

import { createProvider, type RegisteredProviderId } from "./providers/factory.js";
import { ProviderNotConfiguredError } from "./providers/base.js";
import { generateAllReports, generateSection } from "./reports/generator.js";
import { reportStore } from "./reports/store.js";
import { sessionStore, sendChatMessage } from "./chat/session.js";
import { jobStore, resultStore, settingsStore } from "../store/index.js";
import type { PromptContext } from "./prompts/context.js";
import type { AllReports, ReportSectionKey } from "./reports/types.js";

// ---------------------------------------------------------------------------
// Shared error types
// ---------------------------------------------------------------------------

export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "job_not_found"
      | "job_not_completed"
      | "no_intelligence"
      | "provider_not_configured"
      | "provider_error"
      | "reports_not_found"
      | "report_section_not_found",
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "AIServiceError";
  }
}

// ---------------------------------------------------------------------------
// Context builder — shared by all operations
// ---------------------------------------------------------------------------

function buildContext(jobId: string): PromptContext {
  const job = jobStore.get(jobId);
  if (!job) {
    throw new AIServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
  }
  if (job.status !== "completed") {
    throw new AIServiceError(
      `Job "${jobId}" is ${job.status}. AI analysis requires a completed job.`,
      "job_not_completed",
      409
    );
  }

  const result = resultStore.get(jobId);
  if (!result?.repoIntelligence) {
    throw new AIServiceError(
      `No repository intelligence available for job "${jobId}".`,
      "no_intelligence",
      422
    );
  }

  return {
    jobId,
    jobType: job.type,
    target: job.target,
    intelligence: result.repoIntelligence,
    findings: result.findings,
  };
}

// ---------------------------------------------------------------------------
// AIService
// ---------------------------------------------------------------------------

export const AIService = {
  // ── Reports ──────────────────────────────────────────────────────────────

  /**
   * Trigger full report generation for a job.
   * Returns immediately — generation runs in the background.
   * Callers poll GET /ai/reports/:jobId to check progress.
   */
  async startReportGeneration(jobId: string): Promise<{ started: boolean; jobId: string }> {
    const ctx = buildContext(jobId);
    const settings = settingsStore.get();

    let provider;
    try {
      provider = createProvider(settings);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        throw new AIServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    // Fire and forget — run in background
    generateAllReports(jobId, provider, ctx).catch((err) => {
      console.error(`[AIService] Report generation failed for job ${jobId}:`, err);
      reportStore.setOverallStatus(jobId, "error");
    });

    return { started: true, jobId };
  },

  /**
   * Get all stored reports for a job.
   */
  getReports(jobId: string): AllReports {
    // Validate the job exists even if no reports generated yet
    const job = jobStore.get(jobId);
    if (!job) {
      throw new AIServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }

    const reports = reportStore.get(jobId);
    if (!reports) {
      throw new AIServiceError(
        `No AI reports found for job "${jobId}". Call POST /ai/reports/${jobId}/generate first.`,
        "reports_not_found",
        404
      );
    }
    return reports;
  },

  /**
   * Get a single report section.
   */
  getReportSection(jobId: string, key: ReportSectionKey): AllReports[typeof key] {
    const reports = AIService.getReports(jobId);
    return reports[key];
  },

  /**
   * Regenerate a single section (e.g. after changing provider).
   */
  async regenerateSection(jobId: string, key: ReportSectionKey): Promise<void> {
    const ctx = buildContext(jobId);
    const settings = settingsStore.get();

    let provider;
    try {
      provider = createProvider(settings);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        throw new AIServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    generateSection(jobId, key, provider, ctx).catch((err) => {
      console.error(`[AIService] Section "${key}" regeneration failed for job ${jobId}:`, err);
    });
  },

  // ── Chat ─────────────────────────────────────────────────────────────────

  /**
   * Send a chat message and return the assistant's reply.
   */
  async chat(jobId: string, message: string): Promise<{ reply: string; sessionId: string }> {
    const ctx = buildContext(jobId);
    const settings = settingsStore.get();

    let provider;
    try {
      provider = createProvider(settings);
    } catch (err) {
      if (err instanceof ProviderNotConfiguredError) {
        throw new AIServiceError(err.message, "provider_not_configured", 422);
      }
      throw err;
    }

    const reply = await sendChatMessage(jobId, message, provider, ctx);
    return { reply, sessionId: jobId };
  },

  /**
   * Get the chat history for a job.
   */
  getChatHistory(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) {
      throw new AIServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }
    return sessionStore.get(jobId);
  },

  /**
   * Clear the chat history for a job.
   */
  clearChatHistory(jobId: string): void {
    const job = jobStore.get(jobId);
    if (!job) {
      throw new AIServiceError(`Job "${jobId}" not found.`, "job_not_found", 404);
    }
    sessionStore.clear(jobId);
  },
};
