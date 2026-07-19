import type { AllReports, ReportSectionKey, ReportStatus, ReportSection } from "./types.js";

// ---------------------------------------------------------------------------
// In-memory report store — keyed by jobId
// ---------------------------------------------------------------------------

const store = new Map<string, AllReports>();

function emptySection<T>(): ReportSection<T> {
  return { status: "pending", data: null, error: null, generatedAt: null };
}

export const reportStore = {
  /** Initialise a blank AllReports record for a job. */
  init(jobId: string, provider: string): AllReports {
    const record: AllReports = {
      jobId,
      provider,
      startedAt: new Date().toISOString(),
      completedAt: null,
      overallStatus: "pending",
      executiveSummary: emptySection(),
      architecture: emptySection(),
      folderWalkthrough: emptySection(),
      onboarding: emptySection(),
      dependencies: emptySection(),
      risks: emptySection(),
      markdown: emptySection(),
    };
    store.set(jobId, record);
    return record;
  },

  get(jobId: string): AllReports | undefined {
    return store.get(jobId);
  },

  /** Update a specific section's status and data. */
  setSection<T>(
    jobId: string,
    key: ReportSectionKey,
    status: ReportStatus,
    data: T | null,
    error: string | null = null
  ): void {
    const record = store.get(jobId);
    if (!record) return;
    (record[key] as ReportSection<T>) = {
      status,
      data,
      error,
      generatedAt: status === "complete" || status === "error" ? new Date().toISOString() : null,
    };
    store.set(jobId, record);
  },

  /** Mark the overall status of the report set. */
  setOverallStatus(
    jobId: string,
    status: AllReports["overallStatus"],
    completedAt?: string
  ): void {
    const record = store.get(jobId);
    if (!record) return;
    record.overallStatus = status;
    if (completedAt) record.completedAt = completedAt;
    store.set(jobId, record);
  },

  delete(jobId: string): boolean {
    return store.delete(jobId);
  },

  list(): string[] {
    return Array.from(store.keys());
  },
};
