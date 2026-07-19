import { rm } from "fs/promises";
import { basename, sep } from "path";
import { randomUUID } from "crypto";
import { validateGithubUrl, cloneRepository } from "./clone.js";
import { extractZip } from "./extract.js";
import { walkRepository } from "./walker.js";
import { detectLanguagesAndFrameworks } from "./detector.js";
import { detectArchitecture } from "./architect.js";
import { generatePatternFindings } from "./findings.js";
import type { AnalysisResult, JobType } from "../store/index.js";
import type { LanguageStat } from "./detector.js";
import type { ArchitectureInfo } from "./architect.js";

// ---------------------------------------------------------------------------
// RepoIntelligence — the rich structured output of the engine
// ---------------------------------------------------------------------------

export interface RepoStats {
  totalFiles: number;
  totalLines: number;
  totalSizeBytes: number;
  averageFileSizeBytes: number;
}

export interface RepoIntelligence {
  languages: LanguageStat[];
  frameworks: string[];
  packageManagers: string[];
  buildSystems: string[];
  architecture: ArchitectureInfo;
  configFiles: { path: string; type: string }[];
  stats: RepoStats;
  largestFiles: { path: string; sizeBytes: number }[];
  directoryOverview: { directory: string; fileCount: number; percentage: number }[];
  /** First 500 file paths in the repository */
  fileTree: string[];
}

export interface EngineResult {
  analysisResult: AnalysisResult;
  repoIntelligence: RepoIntelligence;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAnalysis(params: {
  jobId: string;
  type: JobType;
  target: string;
  zipBuffer?: Buffer;
  maxFileSizeMb?: number;
  onProgress: (pct: number, msg: string) => void;
}): Promise<EngineResult> {
  const { jobId, type, target, zipBuffer, maxFileSizeMb = 100, onProgress } = params;
  const startMs = Date.now();
  let tmpDir: string | null = null;

  try {
    // ── Phase 1: Acquire source ─────────────────────────────────────────────
    onProgress(5, "Preparing source...");

    if (type === "github_url") {
      const validation = validateGithubUrl(target);
      if (!validation.valid) throw new Error(validation.error ?? "Invalid GitHub URL");
      onProgress(10, "Cloning repository...");
      tmpDir = await cloneRepository(target, (msg) => onProgress(20, msg));
      onProgress(30, "Repository cloned.");
    } else {
      if (!zipBuffer || zipBuffer.length === 0) throw new Error("No ZIP data received.");
      onProgress(10, "Validating ZIP archive...");
      tmpDir = await extractZip(zipBuffer, maxFileSizeMb, (msg) => onProgress(20, msg));
      onProgress(30, "Archive extracted.");
    }

    // ── Phase 2: Walk the filesystem ─────────────────────────────────────────
    onProgress(35, "Scanning repository files...");
    const walkedFiles = await walkRepository(tmpDir);
    onProgress(50, `Discovered ${walkedFiles.length} files.`);

    // ── Phase 3: Parallel detection ─────────────────────────────────────────
    onProgress(55, "Detecting languages, frameworks, and architecture...");
    const [detection, architecture] = await Promise.all([
      detectLanguagesAndFrameworks(tmpDir, walkedFiles),
      detectArchitecture(walkedFiles),
    ]);
    onProgress(70, "Detection complete.");

    // ── Phase 4: Pattern-based findings ─────────────────────────────────────
    onProgress(75, "Running pattern analysis...");
    const findings = await generatePatternFindings(walkedFiles, detection);
    onProgress(88, `Pattern scan complete — ${findings.length} finding(s).`);

    // ── Phase 5: Assemble intelligence ──────────────────────────────────────
    onProgress(92, "Assembling repository report...");

    const totalLines = walkedFiles.reduce((s, f) => s + (f.lineCount ?? 0), 0);
    const totalSize = walkedFiles.reduce((s, f) => s + f.sizeBytes, 0);

    // Directory overview — top-level directories sorted by file count
    const dirCounts: Record<string, number> = {};
    for (const f of walkedFiles) {
      const parts = f.path.split(sep);
      const dir = parts.length > 1 ? parts[0] : "(root)";
      dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
    }
    const directoryOverview = Object.entries(dirCounts)
      .map(([directory, fileCount]) => ({
        directory,
        fileCount,
        percentage: walkedFiles.length > 0 ? Math.round((fileCount / walkedFiles.length) * 100) : 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 20);

    // Largest files
    const largestFiles = [...walkedFiles]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10)
      .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes }));

    // File tree (capped at 500 paths)
    const fileTree = walkedFiles.map((f) => f.path).slice(0, 500);

    const repoIntelligence: RepoIntelligence = {
      languages: detection.languages,
      frameworks: detection.frameworks,
      packageManagers: detection.packageManagers,
      buildSystems: detection.buildSystems,
      architecture,
      configFiles: detection.configFiles,
      stats: {
        totalFiles: walkedFiles.length,
        totalLines,
        totalSizeBytes: totalSize,
        averageFileSizeBytes:
          walkedFiles.length > 0 ? Math.round(totalSize / walkedFiles.length) : 0,
      },
      largestFiles,
      directoryOverview,
      fileTree,
    };

    // Build a factual, AI-free summary from real data
    const langNames = detection.languages.slice(0, 3).map((l) => l.language);
    const fwNames = detection.frameworks.slice(0, 4);
    const archParts: string[] = [];
    if (architecture.frontend.length) archParts.push(architecture.frontend.slice(0, 2).join(" + "));
    if (architecture.backend.length) archParts.push(architecture.backend.slice(0, 2).join(" + ") + " backend");
    if (architecture.database.length) archParts.push(architecture.database.slice(0, 2).join(" + "));
    const archLine = archParts.length ? `Architecture: ${archParts.join(" · ")}.` : "";

    const summary = [
      `${walkedFiles.length} file(s) scanned across ${detection.languages.length} language(s).`,
      langNames.length ? `Primary: ${langNames.join(", ")}.` : "",
      fwNames.length ? `Detected: ${fwNames.join(", ")}.` : "",
      archLine,
      `${findings.length} finding(s) identified by static pattern analysis.`,
    ]
      .filter(Boolean)
      .join(" ");

    // Count severities
    const count = (sev: string) => findings.filter((f) => f.severity === sev).length;

    const analysisResult: AnalysisResult & { repoIntelligence: RepoIntelligence } = {
      jobId,
      summary,
      totalFindings: findings.length,
      criticalCount: count("critical"),
      highCount: count("high"),
      mediumCount: count("medium"),
      lowCount: count("low"),
      infoCount: count("info"),
      findings,
      filesScanned: walkedFiles.length,
      linesScanned: totalLines,
      scanDurationMs: Date.now() - startMs,
      aiProvider: null,
      repoIntelligence,
    };

    onProgress(100, "Analysis complete.");
    return { analysisResult, repoIntelligence };
  } finally {
    // Always clean up — regardless of success or failure
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
