import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { basename } from "path";
import type { WalkedFile } from "./walker.js";
import type { Finding } from "../store/index.js";
import type { DetectionResult } from "./detector.js";

// ---------------------------------------------------------------------------
// Secret patterns to scan for in source files
// ---------------------------------------------------------------------------
interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Finding["severity"];
  category: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "Potential hardcoded API key",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{16,}["']/i,
    severity: "critical",
    category: "Secrets",
  },
  {
    name: "Potential hardcoded password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/i,
    severity: "high",
    category: "Secrets",
  },
  {
    name: "Potential hardcoded JWT secret",
    pattern: /(?:jwt[_-]?secret|token[_-]?secret|secret[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "high",
    category: "Secrets",
  },
  {
    name: "Potential hardcoded database URL",
    pattern: /(?:database[_-]?url|db[_-]?url|connection[_-]?string|database[_-]?uri)\s*[:=]\s*["'][^"']{10,}["']/i,
    severity: "high",
    category: "Secrets",
  },
  {
    name: "AWS access key detected",
    pattern: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/,
    severity: "critical",
    category: "Secrets",
  },
  {
    name: "Private key material detected",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical",
    category: "Secrets",
  },
  {
    name: "Stripe secret key detected",
    pattern: /sk_(?:live|test)_[A-Za-z0-9]{24,}/,
    severity: "critical",
    category: "Secrets",
  },
  {
    name: "GitHub token detected",
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/,
    severity: "critical",
    category: "Secrets",
  },
  {
    name: "Slack token detected",
    pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/,
    severity: "high",
    category: "Secrets",
  },
];

// ---------------------------------------------------------------------------
// Dangerous code patterns
// ---------------------------------------------------------------------------
interface CodePattern {
  name: string;
  pattern: RegExp;
  severity: Finding["severity"];
  category: string;
  description: (file: string, line: number) => string;
}

const CODE_PATTERNS: CodePattern[] = [
  {
    name: "eval() usage",
    pattern: /\beval\s*\(/,
    severity: "medium",
    category: "Code Quality",
    description: (file, line) =>
      `eval() is used at line ${line} in "${file}". When user input reaches eval(), it allows arbitrary code execution.`,
  },
  {
    name: "Unsafe exec() with variable",
    pattern: /\bexec(?:Sync)?\s*\([^"'`][^)]*\)/,
    severity: "medium",
    category: "Injection",
    description: (file, line) =>
      `exec()/execSync() with a non-literal argument at line ${line} in "${file}" may be vulnerable to command injection if user data reaches it.`,
  },
  {
    name: "Disabled TLS certificate verification",
    pattern: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureRequestWarning/,
    severity: "medium",
    category: "Cryptography",
    description: (file, line) =>
      `TLS certificate verification is explicitly disabled at line ${line} in "${file}". This allows man-in-the-middle attacks.`,
  },
  {
    name: "TODO/FIXME security comment",
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX).*(?:security|auth|secret|token|password|vuln)/i,
    severity: "low",
    category: "Code Quality",
    description: (file, line) =>
      `A security-related TODO/FIXME comment was found at line ${line} in "${file}". Ensure this is tracked and resolved.`,
  },
  {
    name: "console.log in production code",
    pattern: /console\.(log|error|warn|info)\s*\(/,
    severity: "info",
    category: "Code Quality",
    description: (file, line) =>
      `console.log() call at line ${line} in "${file}". Debug logging left in production code may expose sensitive data.`,
  },
];

// Extensions to scan for secrets and code patterns
const SCANNABLE_SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rb", ".go", ".php", ".java", ".cs",
]);
const SCANNABLE_CONFIG_EXTS = new Set([".json", ".yaml", ".yml", ".toml", ".xml", ".env"]);
const SKIP_FILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"]);
const MAX_SCAN_BYTES = 500_000;
const MAX_SOURCE_FILES = 500;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function generatePatternFindings(
  files: WalkedFile[],
  detection: DetectionResult
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const fileNames = new Set(files.map((f) => basename(f.path)));

  // ── Structural / configuration findings ──────────────────────────────────

  // .env files committed to version control (not .env.example)
  const committedEnvFiles = files.filter((f) => {
    const name = basename(f.path);
    return name === ".env" || /^\.env\.(local|production|staging|development)$/.test(name);
  });
  for (const f of committedEnvFiles) {
    findings.push({
      id: randomUUID(),
      severity: "high",
      title: `Environment file committed: ${basename(f.path)}`,
      description: `"${f.path}" contains environment variables and should not be committed. It may expose API keys, database credentials, or other secrets.`,
      file: f.path,
      line: null,
      category: "Secrets",
    });
  }

  // Missing .gitignore
  if (!fileNames.has(".gitignore")) {
    findings.push({
      id: randomUUID(),
      severity: "medium",
      title: "No .gitignore file detected",
      description:
        "This repository has no .gitignore. Sensitive files (e.g. .env, node_modules, secrets, build artifacts) may be accidentally committed.",
      file: null,
      line: null,
      category: "Configuration",
    });
  }

  // Conflicting lock files
  const lockFiles = [
    { name: "package-lock.json", pm: "npm" },
    { name: "yarn.lock", pm: "Yarn" },
    { name: "pnpm-lock.yaml", pm: "pnpm" },
    { name: "bun.lockb", pm: "Bun" },
  ].filter((l) => fileNames.has(l.name));
  if (lockFiles.length > 1) {
    findings.push({
      id: randomUUID(),
      severity: "low",
      title: "Multiple package manager lock files present",
      description: `Lock files for ${lockFiles.map((l) => l.pm).join(", ")} were all found. Using multiple package managers leads to inconsistent dependency resolution. Pick one and delete the others.`,
      file: null,
      line: null,
      category: "Dependencies",
    });
  }

  // docker-compose without .dockerignore
  if (
    (fileNames.has("Dockerfile") || fileNames.has("docker-compose.yml") || fileNames.has("docker-compose.yaml")) &&
    !fileNames.has(".dockerignore")
  ) {
    findings.push({
      id: randomUUID(),
      severity: "low",
      title: "Missing .dockerignore file",
      description:
        "Docker is configured but no .dockerignore file was found. Without it, sensitive files like .env, node_modules, and secrets may be included in the Docker image.",
      file: null,
      line: null,
      category: "Configuration",
    });
  }

  // GitHub Actions found — flag for secret exposure risk
  const workflowFiles = files.filter((f) => f.path.includes(".github/workflows/"));
  if (workflowFiles.length > 0) {
    findings.push({
      id: randomUUID(),
      severity: "info",
      title: `${workflowFiles.length} GitHub Actions workflow(s) detected`,
      description:
        `Found ${workflowFiles.length} CI/CD workflow(s). Verify that workflow files do not expose secrets via environment variables or allow script injection through pull request events.`,
      file: workflowFiles[0].path,
      line: null,
      category: "CI/CD",
    });
  }

  // Large source files (possible bundled/generated code committed)
  const largeSourceFiles = files.filter(
    (f) => f.sizeBytes > 500_000 && SCANNABLE_SOURCE_EXTS.has(f.ext)
  );
  for (const f of largeSourceFiles.slice(0, 5)) {
    findings.push({
      id: randomUUID(),
      severity: "info",
      title: `Large source file: ${basename(f.path)} (${(f.sizeBytes / 1024).toFixed(0)} KB)`,
      description: `"${f.path}" is ${(f.sizeBytes / 1024).toFixed(0)} KB. Large source files often indicate minified or bundled code committed to the repo — consider adding them to .gitignore.`,
      file: f.path,
      line: null,
      category: "Code Quality",
    });
  }

  // ── Content scanning ──────────────────────────────────────────────────────

  const scannable = files.filter(
    (f) =>
      f.sizeBytes <= MAX_SCAN_BYTES &&
      f.lineCount !== null &&
      !SKIP_FILES.has(basename(f.path)) &&
      (SCANNABLE_SOURCE_EXTS.has(f.ext) || SCANNABLE_CONFIG_EXTS.has(f.ext))
  );

  // Scan for secrets
  const secretScanFiles = scannable.slice(0, MAX_SOURCE_FILES);
  for (const f of secretScanFiles) {
    try {
      const content = await readFile(f.absPath, "utf-8");
      const lines = content.split("\n");
      for (const sp of SECRET_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          if (sp.pattern.test(lines[i])) {
            // One finding per file per pattern type
            const alreadyHave = findings.some(
              (fnd) => fnd.file === f.path && fnd.title.startsWith(sp.name)
            );
            if (!alreadyHave) {
              findings.push({
                id: randomUUID(),
                severity: sp.severity,
                title: `${sp.name} in ${basename(f.path)}`,
                description: `A potential secret matching the "${sp.name}" pattern was detected in "${f.path}" at line ${i + 1}. Secrets must never be hardcoded — use environment variables.`,
                file: f.path,
                line: i + 1,
                category: sp.category,
              });
            }
            break;
          }
        }
      }
    } catch {
      // skip unreadable
    }
  }

  // Scan for dangerous code patterns (source files only, no configs)
  const sourceScanFiles = scannable
    .filter((f) => SCANNABLE_SOURCE_EXTS.has(f.ext))
    .slice(0, MAX_SOURCE_FILES);

  // Track per-file per-pattern hits to avoid noise
  const codeHits = new Set<string>();

  for (const f of sourceScanFiles) {
    try {
      const content = await readFile(f.absPath, "utf-8");
      const lines = content.split("\n");

      // Skip console.log scan for test/spec files (too noisy)
      const isTestFile = /\.(spec|test)\.[tj]sx?$/.test(f.path) || f.path.includes("__tests__");

      for (const cp of CODE_PATTERNS) {
        if (cp.name === "console.log in production code" && isTestFile) continue;

        for (let i = 0; i < lines.length; i++) {
          if (cp.pattern.test(lines[i])) {
            const hitKey = `${cp.name}:${f.path}`;
            if (!codeHits.has(hitKey)) {
              codeHits.add(hitKey);
              findings.push({
                id: randomUUID(),
                severity: cp.severity,
                title: `${cp.name} in ${basename(f.path)}`,
                description: cp.description(f.path, i + 1),
                file: f.path,
                line: i + 1,
                category: cp.category,
              });
            }
            break; // one finding per file per pattern
          }
        }
      }
    } catch {
      // skip
    }
  }

  // Cap console.log findings at 5 (very noisy otherwise)
  const consoleLogs = findings.filter((f) => f.title.startsWith("console.log in production code"));
  if (consoleLogs.length > 5) {
    const excess = consoleLogs.slice(5);
    for (const e of excess) {
      const idx = findings.indexOf(e);
      if (idx !== -1) findings.splice(idx, 1);
    }
    findings.push({
      id: randomUUID(),
      severity: "info",
      title: `console.log() calls found in multiple files (${consoleLogs.length} total)`,
      description: `${consoleLogs.length} source files contain console.log() calls. Audit these before deploying to production to avoid leaking sensitive data.`,
      file: null,
      line: null,
      category: "Code Quality",
    });
  }

  return findings;
}
