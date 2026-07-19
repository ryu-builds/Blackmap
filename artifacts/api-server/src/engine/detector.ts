import { readFile } from "fs/promises";
import { basename } from "path";
import type { WalkedFile } from "./walker.js";

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
  percentage: number;
}

export interface DetectionResult {
  languages: LanguageStat[];
  frameworks: string[];
  packageManagers: string[];
  buildSystems: string[];
  configFiles: { path: string; type: string }[];
}

// --------------------------------------------------------------------------
// Extension → Language
// --------------------------------------------------------------------------
const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin", ".kts": "Kotlin",
  ".scala": "Scala",
  ".c": "C",
  ".cpp": "C++", ".cc": "C++", ".cxx": "C++",
  ".h": "C/C++", ".hpp": "C++",
  ".cs": "C#",
  ".swift": "Swift",
  ".dart": "Dart",
  ".php": "PHP",
  ".r": "R",
  ".ex": "Elixir", ".exs": "Elixir",
  ".erl": "Erlang",
  ".lua": "Lua",
  ".hs": "Haskell",
  ".clj": "Clojure", ".cljs": "ClojureScript",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".astro": "Astro",
  ".html": "HTML", ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".sql": "SQL",
  ".graphql": "GraphQL", ".gql": "GraphQL",
  ".proto": "Protobuf",
  ".tf": "Terraform", ".hcl": "HCL",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell", ".fish": "Shell",
  ".yaml": "YAML", ".yml": "YAML",
  ".json": "JSON",
  ".toml": "TOML",
  ".xml": "XML",
  ".md": "Markdown", ".mdx": "Markdown",
};

// --------------------------------------------------------------------------
// Well-known config file names → human label
// --------------------------------------------------------------------------
const CONFIG_FILE_MAP: Record<string, string> = {
  "package.json": "Node.js Package",
  "package-lock.json": "npm Lock File",
  "yarn.lock": "Yarn Lock File",
  "pnpm-lock.yaml": "pnpm Lock File",
  "bun.lockb": "Bun Lock File",
  "requirements.txt": "Python Requirements",
  "Pipfile": "Python Pipfile",
  "pyproject.toml": "Python Project",
  "setup.py": "Python Setup",
  "Cargo.toml": "Rust Package",
  "Cargo.lock": "Rust Lock File",
  "go.mod": "Go Module",
  "go.sum": "Go Checksum",
  "pom.xml": "Maven POM",
  "build.gradle": "Gradle Build",
  "build.gradle.kts": "Gradle Build (Kotlin)",
  "Gemfile": "Ruby Gemfile",
  "Gemfile.lock": "Ruby Gems Lock",
  "composer.json": "PHP Composer",
  "pubspec.yaml": "Dart/Flutter pubspec",
  "Dockerfile": "Dockerfile",
  "docker-compose.yml": "Docker Compose",
  "docker-compose.yaml": "Docker Compose",
  ".dockerignore": "Docker Ignore",
  "Makefile": "Makefile",
  "vercel.json": "Vercel Config",
  "netlify.toml": "Netlify Config",
  "fly.toml": "Fly.io Config",
  "render.yaml": "Render Config",
  "railway.json": "Railway Config",
  "Procfile": "Heroku Procfile",
  "turbo.json": "Turborepo",
  "nx.json": "Nx Workspace",
  "lerna.json": "Lerna",
  "rush.json": "Rush Monorepo",
  "tsconfig.json": "TypeScript Config",
  "eslint.config.js": "ESLint Config",
  "eslint.config.mjs": "ESLint Config",
  ".eslintrc": "ESLint Config",
  ".eslintrc.json": "ESLint Config",
  ".eslintrc.js": "ESLint Config",
  ".prettierrc": "Prettier Config",
  ".prettierrc.json": "Prettier Config",
  "tailwind.config.js": "Tailwind Config",
  "tailwind.config.ts": "Tailwind Config",
  "vite.config.ts": "Vite Config",
  "vite.config.js": "Vite Config",
  "webpack.config.js": "Webpack Config",
  "rollup.config.js": "Rollup Config",
  "next.config.js": "Next.js Config",
  "next.config.ts": "Next.js Config",
  "next.config.mjs": "Next.js Config",
  "nuxt.config.ts": "Nuxt Config",
  "svelte.config.js": "Svelte Config",
  "astro.config.mjs": "Astro Config",
  ".env": "Environment Variables",
  ".env.example": "Environment Template",
  ".env.sample": "Environment Template",
  ".gitignore": "Git Ignore",
  ".gitattributes": "Git Attributes",
  "openapi.yaml": "OpenAPI Spec",
  "openapi.json": "OpenAPI Spec",
  "swagger.yaml": "OpenAPI Spec",
};

// --------------------------------------------------------------------------
// Main detection entry point
// --------------------------------------------------------------------------
export async function detectLanguagesAndFrameworks(
  rootDir: string,
  files: WalkedFile[]
): Promise<DetectionResult> {
  const fileNames = new Set(files.map((f) => basename(f.path)));

  // --- Language stats ---
  const langCounts: Record<string, { files: number; lines: number }> = {};
  for (const f of files) {
    const lang = LANGUAGE_MAP[f.ext];
    if (lang) {
      if (!langCounts[lang]) langCounts[lang] = { files: 0, lines: 0 };
      langCounts[lang].files++;
      langCounts[lang].lines += f.lineCount ?? 0;
    }
  }
  const totalLines = Object.values(langCounts).reduce((s, v) => s + v.lines, 0);
  const languages: LanguageStat[] = Object.entries(langCounts)
    .map(([language, { files: fc, lines }]) => ({
      language,
      files: fc,
      lines,
      percentage: totalLines > 0 ? Math.round((lines / totalLines) * 100) : 0,
    }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 15);

  // --- Config files ---
  const configFiles: { path: string; type: string }[] = [];
  for (const f of files) {
    const name = basename(f.path);
    if (CONFIG_FILE_MAP[name]) {
      configFiles.push({ path: f.path, type: CONFIG_FILE_MAP[name] });
    }
  }

  // --- Package managers ---
  const packageManagers: string[] = [];
  if (fileNames.has("package-lock.json")) packageManagers.push("npm");
  if (fileNames.has("yarn.lock")) packageManagers.push("Yarn");
  if (fileNames.has("pnpm-lock.yaml")) packageManagers.push("pnpm");
  if (fileNames.has("bun.lockb")) packageManagers.push("Bun");
  if (fileNames.has("requirements.txt") || fileNames.has("Pipfile")) packageManagers.push("pip");
  if (fileNames.has("pyproject.toml")) packageManagers.push("Poetry/Hatch");
  if (fileNames.has("Cargo.toml")) packageManagers.push("Cargo");
  if (fileNames.has("go.mod")) packageManagers.push("Go Modules");
  if (fileNames.has("Gemfile")) packageManagers.push("Bundler");
  if (fileNames.has("composer.json")) packageManagers.push("Composer");
  if (fileNames.has("pubspec.yaml")) packageManagers.push("pub (Dart)");

  // --- Build systems ---
  const buildSystems: string[] = [];
  if (fileNames.has("Makefile")) buildSystems.push("Make");
  if (fileNames.has("turbo.json")) buildSystems.push("Turborepo");
  if (fileNames.has("nx.json")) buildSystems.push("Nx");
  if (fileNames.has("lerna.json")) buildSystems.push("Lerna");
  if (fileNames.has("vite.config.ts") || fileNames.has("vite.config.js")) buildSystems.push("Vite");
  if (fileNames.has("webpack.config.js")) buildSystems.push("Webpack");
  if (fileNames.has("rollup.config.js")) buildSystems.push("Rollup");
  if (files.some((f) => f.path.endsWith("build.mjs") || f.path === "esbuild.config.js")) buildSystems.push("esbuild");
  if (fileNames.has("build.gradle") || fileNames.has("build.gradle.kts")) buildSystems.push("Gradle");
  if (fileNames.has("pom.xml")) buildSystems.push("Maven");

  // --- Frameworks (from package.json) ---
  const frameworks: string[] = [];
  const packageJsonFiles = files
    .filter((f) => f.path === "package.json" || (basename(f.path) === "package.json" && !f.path.includes("node_modules")))
    .slice(0, 5); // inspect up to 5 package.json files in monorepos

  for (const pkgFile of packageJsonFiles) {
    try {
      const content = await readFile(pkgFile.absPath, "utf-8");
      const pkg = JSON.parse(content);
      const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

      const add = (name: string) => { if (!frameworks.includes(name)) frameworks.push(name); };

      // Frontend
      if (all["react"]) add("React");
      if (all["next"]) add("Next.js");
      if (all["vue"]) add("Vue");
      if (all["nuxt"]) add("Nuxt");
      if (all["@angular/core"]) add("Angular");
      if (all["svelte"]) add("Svelte");
      if (all["astro"]) add("Astro");
      if (all["solid-js"]) add("SolidJS");
      if (all["@remix-run/react"] || all["remix"]) add("Remix");
      if (all["qwik"] || all["@builder.io/qwik"]) add("Qwik");
      // Backend
      if (all["express"]) add("Express");
      if (all["fastify"]) add("Fastify");
      if (all["hono"]) add("Hono");
      if (all["koa"]) add("Koa");
      if (all["@nestjs/core"]) add("NestJS");
      if (all["@trpc/server"]) add("tRPC");
      if (all["elysia"]) add("Elysia");
      // Mobile
      if (all["react-native"]) add("React Native");
      if (all["expo"]) add("Expo");
      // Testing
      if (all["jest"]) add("Jest");
      if (all["vitest"]) add("Vitest");
      if (all["@playwright/test"] || all["playwright"]) add("Playwright");
      if (all["cypress"]) add("Cypress");
      // Styling
      if (all["tailwindcss"]) add("Tailwind CSS");
      // ORM / DB
      if (all["@prisma/client"] || all["prisma"]) add("Prisma");
      if (all["drizzle-orm"]) add("Drizzle ORM");
      if (all["typeorm"]) add("TypeORM");
      if (all["sequelize"]) add("Sequelize");
      if (all["mongoose"]) add("Mongoose");
    } catch {
      // skip parse errors
    }
  }

  // --- Python frameworks from requirements.txt ---
  const reqFile = files.find((f) => f.path === "requirements.txt");
  if (reqFile) {
    try {
      const content = await readFile(reqFile.absPath, "utf-8");
      const add = (name: string) => { if (!frameworks.includes(name)) frameworks.push(name); };
      if (/^fastapi\b/im.test(content)) add("FastAPI");
      if (/^django\b/im.test(content)) add("Django");
      if (/^flask\b/im.test(content)) add("Flask");
      if (/^starlette\b/im.test(content)) add("Starlette");
      if (/^sqlalchemy\b/im.test(content)) add("SQLAlchemy");
      if (/^pydantic\b/im.test(content)) add("Pydantic");
      if (/^celery\b/im.test(content)) add("Celery");
    } catch {}
  }

  // --- Rust frameworks from Cargo.toml ---
  const cargoFile = files.find((f) => f.path === "Cargo.toml");
  if (cargoFile) {
    try {
      const content = await readFile(cargoFile.absPath, "utf-8");
      const add = (name: string) => { if (!frameworks.includes(name)) frameworks.push(name); };
      if (content.includes("actix-web")) add("Actix Web");
      if (content.includes("axum")) add("Axum");
      if (content.includes("warp")) add("Warp");
      if (content.includes("rocket")) add("Rocket");
      if (content.includes("tokio")) add("Tokio");
    } catch {}
  }

  return { languages, frameworks, packageManagers, buildSystems, configFiles };
}
