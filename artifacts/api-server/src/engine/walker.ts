import { readdir, stat, readFile } from "fs/promises";
import { join, relative, extname, sep } from "path";

// Directories to completely skip during traversal
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target",
  "venv", ".venv", "env", "coverage", ".next", ".nuxt",
  "__pycache__", ".cache", ".parcel-cache", ".turbo",
  "out", ".output", "vendor", ".gradle", ".mvn",
  "Pods", ".yarn", "bower_components", ".sass-cache",
  "tmp", "temp", ".temp", "logs",
]);

// File extensions we consider readable text
const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".dart",
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".json", ".yaml", ".yml", ".toml", ".xml",
  ".md", ".mdx", ".txt", ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql", ".proto", ".tf", ".hcl",
  ".vue", ".svelte", ".astro",
  ".php", ".r", ".m", ".ex", ".exs", ".erl",
  ".lua", ".pl", ".hs", ".clj", ".cljs",
  ".env", ".gitignore", ".gitattributes", ".editorconfig",
  ".eslintrc", ".prettierrc", ".babelrc", ".nvmrc",
]);

const MAX_FILE_READ_BYTES = 2 * 1024 * 1024; // 2 MB per file for line counting
const MAX_FILES = 10_000;

export interface WalkedFile {
  /** Path relative to repository root */
  path: string;
  absPath: string;
  ext: string;
  sizeBytes: number;
  /** null when file is binary or exceeds read limit */
  lineCount: number | null;
}

export async function walkRepository(rootDir: string): Promise<WalkedFile[]> {
  const files: WalkedFile[] = [];
  await walkDir(rootDir, rootDir, files);
  return files;
}

async function walkDir(
  rootDir: string,
  currentDir: string,
  files: WalkedFile[]
): Promise<void> {
  if (files.length >= MAX_FILES) return;

  // Read directory names only, then stat individually to check type
  let names: string[];
  try {
    names = await readdir(currentDir);
  } catch {
    return;
  }

  for (const name of names) {
    if (files.length >= MAX_FILES) break;
    const absPath = join(currentDir, name);

    let st: Awaited<ReturnType<typeof stat>>;
    try { st = await stat(absPath); } catch { continue; }

    if (st.isDirectory()) {
      // Skip ignored dirs; allow a small set of dotdirs
      if (IGNORE_DIRS.has(name)) continue;
      if (name.startsWith(".") && name !== ".github" && name !== ".husky") continue;
      await walkDir(rootDir, absPath, files);
    } else if (st.isFile()) {
      const filePath = relative(rootDir, absPath);
      const ext = extname(name).toLowerCase();

      let lineCount: number | null = null;
      if (st.size <= MAX_FILE_READ_BYTES && (TEXT_EXTS.has(ext) || ext === "")) {
        try {
          const content = await readFile(absPath, "utf-8");
          lineCount = content.split("\n").length;
        } catch {
          lineCount = null;
        }
      }

      files.push({ path: filePath, absPath, ext, sizeBytes: st.size, lineCount });
    }
  }
}

export function isTextExt(ext: string): boolean {
  return TEXT_EXTS.has(ext);
}
