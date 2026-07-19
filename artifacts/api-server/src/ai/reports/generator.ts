/**
 * Report generator — orchestrates the sequential generation of all 7 reports.
 *
 * Generation order:
 *   1. executiveSummary
 *   2. architecture
 *   3. folderWalkthrough
 *   4. onboarding
 *   5. dependencies
 *   6. risks
 *   7. markdown (consumes all previous reports)
 *
 * Each report is independently stored as it completes so partial results
 * are available even if later steps fail.
 */

import type { AIProvider } from "../providers/base.js";
import type { PromptContext } from "../prompts/context.js";
import type { AllReports, ReportSectionKey } from "./types.js";
import { reportStore } from "./store.js";
import {
  executiveSummaryTemplate,
  architectureReportTemplate,
  folderWalkthroughTemplate,
  developerOnboardingTemplate,
  dependencyAnalysisTemplate,
  riskSummaryTemplate,
  markdownReportTemplate,
} from "../prompts/templates.js";

// ---------------------------------------------------------------------------
// JSON extraction — handles providers that wrap JSON in markdown fences
// ---------------------------------------------------------------------------

function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  // Find the first { or [ and last } or ]
  const start = raw.search(/[{[]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start !== -1 && end !== -1 && end > start) return raw.slice(start, end + 1);
  return raw;
}

function parseJsonResponse<T>(raw: string): T {
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${(err as Error).message}\n\nRaw response (first 500 chars): ${raw.slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------------
// Single section runner — generates one report section
// ---------------------------------------------------------------------------

async function runSection<T>(
  jobId: string,
  key: ReportSectionKey,
  provider: AIProvider,
  messages: import("../providers/base.js").ChatMessage[],
  isMarkdown = false
): Promise<T | null> {
  reportStore.setSection(jobId, key, "generating", null);
  try {
    const raw = await provider.complete(messages, { maxTokens: 4096, temperature: 0.3 });
    const data = isMarkdown ? (raw as unknown as T) : parseJsonResponse<T>(raw);
    reportStore.setSection(jobId, key, "complete", data);
    return data;
  } catch (err: any) {
    const message = err?.message ?? "Unknown error";
    reportStore.setSection(jobId, key, "error", null, message);
    console.error(`[ai/generator] Section "${key}" failed for job ${jobId}: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateAllReports(
  jobId: string,
  provider: AIProvider,
  ctx: PromptContext
): Promise<AllReports> {
  // Initialise the record (resets if previously run)
  reportStore.init(jobId, provider.name);
  reportStore.setOverallStatus(jobId, "running");

  // Import types lazily to avoid circular references
  const {
    ExecutiveSummary,
    ArchitectureReport,
    FolderWalkthrough,
    DeveloperOnboarding,
    DependencyAnalysis,
    RiskSummary,
  } = {} as any; // types only — no runtime values needed

  // 1. Executive Summary
  const execSummary = await runSection(
    jobId,
    "executiveSummary",
    provider,
    executiveSummaryTemplate(ctx)
  );

  // 2. Architecture Report
  const architecture = await runSection(
    jobId,
    "architecture",
    provider,
    architectureReportTemplate(ctx)
  );

  // 3. Folder Walkthrough
  const folderWalkthrough = await runSection(
    jobId,
    "folderWalkthrough",
    provider,
    folderWalkthroughTemplate(ctx)
  );

  // 4. Developer Onboarding
  const onboarding = await runSection(
    jobId,
    "onboarding",
    provider,
    developerOnboardingTemplate(ctx)
  );

  // 5. Dependency Analysis
  const dependencies = await runSection(
    jobId,
    "dependencies",
    provider,
    dependencyAnalysisTemplate(ctx)
  );

  // 6. Risk Summary
  const risks = await runSection(
    jobId,
    "risks",
    provider,
    riskSummaryTemplate(ctx)
  );

  // 7. Markdown — synthesises everything generated so far
  const partialReports = {
    executiveSummary: execSummary,
    architecture,
    folderWalkthrough,
    onboarding,
    dependencies,
    risks,
  };

  await runSection(
    jobId,
    "markdown",
    provider,
    markdownReportTemplate(ctx, partialReports as any),
    true // raw markdown, not JSON
  );

  // Determine final status
  const record = reportStore.get(jobId)!;
  const sections: ReportSectionKey[] = [
    "executiveSummary", "architecture", "folderWalkthrough",
    "onboarding", "dependencies", "risks", "markdown",
  ];
  const hasErrors = sections.some((k) => record[k].status === "error");
  const allComplete = sections.every((k) => record[k].status === "complete");

  const overallStatus = allComplete ? "complete" : hasErrors ? "partial" : "complete";
  reportStore.setOverallStatus(jobId, overallStatus, new Date().toISOString());

  return reportStore.get(jobId)!;
}

// ---------------------------------------------------------------------------
// Generate a single section (for on-demand or retry scenarios)
// ---------------------------------------------------------------------------

export async function generateSection(
  jobId: string,
  key: ReportSectionKey,
  provider: AIProvider,
  ctx: PromptContext
): Promise<void> {
  const templateMap: Record<ReportSectionKey, () => import("../providers/base.js").ChatMessage[]> = {
    executiveSummary: () => executiveSummaryTemplate(ctx),
    architecture: () => architectureReportTemplate(ctx),
    folderWalkthrough: () => folderWalkthroughTemplate(ctx),
    onboarding: () => developerOnboardingTemplate(ctx),
    dependencies: () => dependencyAnalysisTemplate(ctx),
    risks: () => riskSummaryTemplate(ctx),
    markdown: () => {
      const record = reportStore.get(jobId);
      return markdownReportTemplate(ctx, {
        executiveSummary: record?.executiveSummary.data ?? undefined,
        architecture: record?.architecture.data ?? undefined,
        folderWalkthrough: record?.folderWalkthrough.data ?? undefined,
        onboarding: record?.onboarding.data ?? undefined,
        dependencies: record?.dependencies.data ?? undefined,
        risks: record?.risks.data ?? undefined,
      } as any);
    },
  };

  const isMarkdown = key === "markdown";
  await runSection(jobId, key, provider, templateMap[key](), isMarkdown);
}
