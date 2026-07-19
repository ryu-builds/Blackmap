import { randomUUID } from "crypto";
import { runAnalysis } from "../engine/index.js";
import type { RepoIntelligence } from "../engine/index.js";

// ---------------------------------------------------------------------------
// Types (mirror OpenAPI schemas + extended with repoIntelligence)
// ---------------------------------------------------------------------------

export type JobType = "github_url" | "zip_upload";
export type JobStatus = "queued" | "running" | "completed" | "failed";
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AnalysisJob {
  id: string;
  type: JobType;
  target: string;
  status: JobStatus;
  progress: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  file: string | null;
  line: number | null;
  category: string;
}

export interface AnalysisResult {
  jobId: string;
  summary: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  findings: Finding[];
  filesScanned: number;
  linesScanned: number;
  scanDurationMs: number;
  aiProvider: string | null;
  /** Extended: full structured repository intelligence */
  repoIntelligence?: RepoIntelligence;
}

export interface AppSettings {
  activeProvider: string | null;
  apiKeys: Record<string, string>;
  theme: "light" | "dark" | "system";
  maxFileSizeMb: number;
  autoAnalyze: boolean;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const jobs = new Map<string, AnalysisJob>();
const results = new Map<string, AnalysisResult>();

// ---------------------------------------------------------------------------
// Job store operations
// ---------------------------------------------------------------------------

export const jobStore = {
  list(): AnalysisJob[] {
    return Array.from(jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  get(id: string): AnalysisJob | undefined {
    return jobs.get(id);
  },

  create(input: {
    type: JobType;
    target: string;
    description: string | null;
    zipBuffer?: Buffer;
  }): AnalysisJob {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: AnalysisJob = {
      id,
      type: input.type,
      target: input.target,
      status: "queued",
      progress: 0,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      errorMessage: null,
    };
    jobs.set(id, job);

    // Fire-and-forget: run real analysis in background
    runRealAnalysis(id, input.type, input.target, input.zipBuffer).catch((err) => {
      console.error(`[jobStore] Unhandled error in runRealAnalysis(${id}):`, err);
    });

    return job;
  },

  delete(id: string): boolean {
    results.delete(id);
    return jobs.delete(id);
  },

  /** Internal: update a job's fields */
  _update(id: string, patch: Partial<AnalysisJob>) {
    const job = jobs.get(id);
    if (!job) return;
    jobs.set(id, { ...job, ...patch, updatedAt: new Date().toISOString() });
  },
};

// ---------------------------------------------------------------------------
// Results store operations
// ---------------------------------------------------------------------------

export const resultStore = {
  get(jobId: string): AnalysisResult | undefined {
    return results.get(jobId);
  },
};

// ---------------------------------------------------------------------------
// Settings store
// ---------------------------------------------------------------------------

let settings: AppSettings = {
  activeProvider: null,
  apiKeys: {},
  theme: "system",
  maxFileSizeMb: 100,
  autoAnalyze: false,
};

export const settingsStore = {
  get(): AppSettings {
    return { ...settings, apiKeys: { ...settings.apiKeys } };
  },

  update(patch: Partial<AppSettings>): AppSettings {
    settings = { ...settings, ...patch };
    return settingsStore.get();
  },
};

// ---------------------------------------------------------------------------
// AI providers (static catalog)
// ---------------------------------------------------------------------------

export const AI_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o and GPT-4o-mini models. Best general-purpose analysis.",
    status: "available" as const,
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 3.5 Sonnet. Excellent for nuanced security reasoning.",
    status: "available" as const,
    requiresApiKey: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 1.5 Pro. Strong at large-context code analysis.",
    status: "available" as const,
    requiresApiKey: true,
  },
  {
    id: "local",
    name: "Local (Ollama)",
    description: "Run analysis locally with Ollama. No API key required.",
    status: "unavailable" as const,
    requiresApiKey: false,
  },
];

// ---------------------------------------------------------------------------
// Real analysis runner (replaces simulateJobProgress)
// ---------------------------------------------------------------------------

async function runRealAnalysis(
  jobId: string,
  type: JobType,
  target: string,
  zipBuffer?: Buffer
): Promise<void> {
  const updateJob = (patch: Partial<AnalysisJob>) => jobStore._update(jobId, patch);

  try {
    updateJob({ status: "running", progress: 5 });

    const { analysisResult } = await runAnalysis({
      jobId,
      type,
      target,
      zipBuffer,
      maxFileSizeMb: settings.maxFileSizeMb,
      onProgress: (pct, msg) => {
        updateJob({ progress: pct });
      },
    });

    // Store result and mark completed
    results.set(jobId, analysisResult);
    const now = new Date().toISOString();
    updateJob({
      status: "completed",
      progress: 100,
      completedAt: now,
      errorMessage: null,
    });
  } catch (err: any) {
    const errorMessage = err?.message ?? "Unknown error during analysis";
    console.error(`[recon] Job ${jobId} failed:`, errorMessage);
    updateJob({
      status: "failed",
      errorMessage,
    });
  }
}
