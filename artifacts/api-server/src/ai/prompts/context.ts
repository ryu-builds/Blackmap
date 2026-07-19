import type { RepoIntelligence } from "../../engine/index.js";
import type { Finding, JobType } from "../../store/index.js";

// ---------------------------------------------------------------------------
// PromptContext — the full repository intelligence handed to every template
// ---------------------------------------------------------------------------

export interface PromptContext {
  /** Job identifier */
  jobId: string;
  /** github_url or zip_upload */
  jobType: JobType;
  /** URL or filename that was analysed */
  target: string;
  /** Full structured repository intelligence from the engine */
  intelligence: RepoIntelligence;
  /** Pattern-based findings from the static analysis pass */
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// Serialise intelligence for inclusion in prompts.
// We deliberately truncate the file tree and directoryOverview to stay
// well within typical model context windows.
// ---------------------------------------------------------------------------

export function serialiseContext(ctx: PromptContext): string {
  const { intelligence: i, findings, target, jobType } = ctx;

  const trimmedTree = i.fileTree.slice(0, 150);
  const treeStr = trimmedTree.join("\n");
  const treeNote =
    i.fileTree.length > 150
      ? `\n(${i.fileTree.length - 150} more files omitted)`
      : "";

  return JSON.stringify(
    {
      target,
      jobType,
      stats: i.stats,
      languages: i.languages,
      frameworks: i.frameworks,
      packageManagers: i.packageManagers,
      buildSystems: i.buildSystems,
      architecture: i.architecture,
      configFiles: i.configFiles,
      largestFiles: i.largestFiles,
      directoryOverview: i.directoryOverview,
      fileTree: treeStr + treeNote,
      findings: findings.map((f) => ({
        severity: f.severity,
        title: f.title,
        description: f.description,
        file: f.file,
        line: f.line,
        category: f.category,
      })),
    },
    null,
    2
  );
}
