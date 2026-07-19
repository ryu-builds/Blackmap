/**
 * Source-file chunker.
 *
 * Splits file content into overlapping windows while:
 *  - Preserving file path and line numbers (1-indexed, inclusive).
 *  - Respecting language-aware boundaries (function/class starts) when
 *    possible, so chunks don't cut a function header from its body.
 *  - Including a rich preamble in each chunk so the LLM knows the file
 *    context without needing a separate metadata lookup.
 *
 * Language-aware boundary detection:
 *  - TypeScript/JavaScript: lines starting with export, function, class,
 *    const/let/var <Name> = (, async function, arrow functions, etc.
 *  - Python: def, class, async def at column 0.
 *  - Go: func at column 0.
 *  - Rust: fn, pub fn, impl at column 0.
 *  - Other: falls back to pure window chunking.
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** Target number of lines per chunk (soft limit). Default: 40. */
  chunkSize?: number;
  /** Number of overlapping lines between consecutive chunks. Default: 8. */
  overlap?: number;
  /** Minimum non-empty lines to keep a chunk. Default: 5. */
  minLines?: number;
}

export interface Chunk {
  /** Globally unique chunk identifier (deterministic from content). */
  id: string;
  jobId: string;
  filePath: string;
  language: string;
  /** 1-indexed start line (inclusive). */
  startLine: number;
  /** 1-indexed end line (inclusive). */
  endLine: number;
  /** Chunk index within the file (0-based). */
  chunkIndex: number;
  /** SHA-256 hash of the full file content (for incremental indexing). */
  fileHash: string;
  /** Full text that will be embedded. Includes a preamble header. */
  content: string;
  /** Raw source lines (without preamble) — stored for display. */
  rawLines: string;
}

// ---------------------------------------------------------------------------
// Language detection (by extension)
// ---------------------------------------------------------------------------

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp", cc: "cpp", cxx: "cpp",
  c: "c",
  h: "c",
  swift: "swift",
  sh: "shell", bash: "shell",
  yaml: "yaml", yml: "yaml",
  json: "json",
  toml: "toml",
  md: "markdown",
  sql: "sql",
  html: "html", htm: "html",
  css: "css", scss: "css", less: "css",
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}

// ---------------------------------------------------------------------------
// Language-aware boundary patterns
// ---------------------------------------------------------------------------

const BOUNDARIES: Record<string, RegExp> = {
  typescript: /^(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?\(|let\s+\w+\s*=\s*(?:async\s+)?\(|interface\s+\w|type\s+\w|enum\s+\w)/,
  javascript: /^(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?\(|let\s+\w+\s*=\s*(?:async\s+)?\()/,
  python: /^(?:def |class |async def )/,
  go: /^func /,
  rust: /^(?:pub\s+)?(?:fn |impl |struct |enum |trait )/,
  java: /^(?:public|private|protected|static|final|abstract)\s+/,
};

function isBoundary(line: string, lang: string): boolean {
  const pattern = BOUNDARIES[lang];
  if (!pattern) return false;
  return pattern.test(line.trimStart());
}

// ---------------------------------------------------------------------------
// Window-based chunker with optional boundary snapping
// ---------------------------------------------------------------------------

export function chunkFile(
  jobId: string,
  filePath: string,
  content: string,
  options: ChunkOptions = {}
): Chunk[] {
  const { chunkSize = 40, overlap = 8, minLines = 5 } = options;

  const lines = content.split("\n");
  const fileHash = createHash("sha256").update(content).digest("hex");
  const lang = detectLanguage(filePath);
  const chunks: Chunk[] = [];

  let start = 0;
  let chunkIdx = 0;

  while (start < lines.length) {
    let end = Math.min(start + chunkSize - 1, lines.length - 1);

    // Snap end forward to the next boundary when close to one (avoids
    // cutting a function header off from its first line of body).
    if (end < lines.length - 1) {
      const lookAhead = Math.min(end + 6, lines.length - 1);
      for (let i = end + 1; i <= lookAhead; i++) {
        if (isBoundary(lines[i], lang)) {
          end = i - 1; // stop just before the boundary
          break;
        }
      }
    }

    const rawLines = lines.slice(start, end + 1);
    const nonEmpty = rawLines.filter((l) => l.trim()).length;

    if (nonEmpty >= minLines) {
      const rawText = rawLines.join("\n");
      const preamble = `File: ${filePath}\nLanguage: ${lang}\nLines: ${start + 1}-${end + 1}\n\n`;
      const fullContent = preamble + rawText;

      // Deterministic ID: hash of job + path + position
      const idSource = `${jobId}:${filePath}:${start}:${end}`;
      const id = createHash("sha256").update(idSource).digest("hex").slice(0, 16);

      chunks.push({
        id,
        jobId,
        filePath,
        language: lang,
        startLine: start + 1,
        endLine: end + 1,
        chunkIndex: chunkIdx,
        fileHash,
        content: fullContent,
        rawLines: rawText,
      });

      chunkIdx++;
    }

    // Advance with overlap
    start = end + 1 - overlap;
    if (start <= end - chunkSize + 1) start = end + 1; // safety: always progress
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Compute file hash without chunking (for incremental check)
// ---------------------------------------------------------------------------

export function hashFileContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
