// ---------------------------------------------------------------------------
// Report type definitions — one interface per AI-generated report
// ---------------------------------------------------------------------------

export interface ExecutiveSummary {
  projectName: string;
  projectDescription: string;
  primaryPurpose: string;
  complexity: "simple" | "moderate" | "complex" | "very-complex";
  complexityRationale: string;
  recommendedAudience: string;
  keyTechnologies: string[];
  highlights: string[];
  concerns: string[];
  overallAssessment: string;
}

export interface ArchitectureSection {
  description: string;
  technologies: string[];
  patterns: string[];
}

export interface AuthSection {
  description: string;
  approach: string;
  technologies: string[];
}

export interface ApiSection {
  description: string;
  style: string;
  technologies: string[];
}

export interface DeploymentSection {
  description: string;
  platform: string;
  technologies: string[];
}

export interface ArchitectureReport {
  overview: string;
  frontend: ArchitectureSection | null;
  backend: ArchitectureSection | null;
  database: ArchitectureSection | null;
  authentication: AuthSection | null;
  apis: ApiSection | null;
  deployment: DeploymentSection | null;
  monorepo: boolean;
  architecturePatterns: string[];
  recommendations: string[];
}

export interface DirectoryEntry {
  name: string;
  purpose: string;
  importance: "critical" | "important" | "supporting" | "auxiliary";
  keyFiles: string[];
  notes: string;
}

export interface FolderWalkthrough {
  overview: string;
  directories: DirectoryEntry[];
}

export interface EntryPoint {
  path: string;
  description: string;
}

export interface EnvVariable {
  name: string;
  purpose: string;
  required: boolean;
}

export interface DeveloperOnboarding {
  overview: string;
  entryPoints: EntryPoint[];
  requestFlow: string;
  buildProcess: string;
  environmentVariables: EnvVariable[];
  developmentWorkflow: string;
  quickStart: string[];
  gotchas: string[];
}

export interface DependencyEntry {
  name: string;
  category: "frontend" | "backend" | "database" | "testing" | "tooling" | "other";
  purpose: string;
  alternatives: string[];
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
}

export interface DependencyAnalysis {
  overview: string;
  dependencies: DependencyEntry[];
  licenseConsiderations: string;
  updateRecommendations: string;
}

export interface RiskFinding {
  severity: string;
  title: string;
  explanation: string;
  remediation: string;
  category: string;
  file: string | null;
  line: number | null;
}

export interface RiskSummary {
  overallRisk: "low" | "medium" | "high" | "critical";
  overview: string;
  findings: RiskFinding[];
  criticalActions: string[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Report generation status per section
// ---------------------------------------------------------------------------

export type ReportStatus = "pending" | "generating" | "complete" | "error";

export interface ReportSection<T> {
  status: ReportStatus;
  data: T | null;
  error: string | null;
  generatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Container for all reports belonging to a single job
// ---------------------------------------------------------------------------

export interface AllReports {
  jobId: string;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  overallStatus: "pending" | "running" | "complete" | "partial" | "error";
  executiveSummary: ReportSection<ExecutiveSummary>;
  architecture: ReportSection<ArchitectureReport>;
  folderWalkthrough: ReportSection<FolderWalkthrough>;
  onboarding: ReportSection<DeveloperOnboarding>;
  dependencies: ReportSection<DependencyAnalysis>;
  risks: ReportSection<RiskSummary>;
  markdown: ReportSection<string>;
}

export type ReportSectionKey =
  | "executiveSummary"
  | "architecture"
  | "folderWalkthrough"
  | "onboarding"
  | "dependencies"
  | "risks"
  | "markdown";
