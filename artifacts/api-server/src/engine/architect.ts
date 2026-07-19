import { readFile } from "fs/promises";
import { basename } from "path";
import type { WalkedFile } from "./walker.js";

export interface ArchitectureInfo {
  frontend: string[];
  backend: string[];
  database: string[];
  apis: string[];
  authentication: string[];
  stateManagement: string[];
  deployment: string[];
  testing: string[];
  styling: string[];
  monorepo: boolean;
}

export async function detectArchitecture(files: WalkedFile[]): Promise<ArchitectureInfo> {
  const fileNames = new Set(files.map((f) => basename(f.path)));

  const arch: ArchitectureInfo = {
    frontend: [],
    backend: [],
    database: [],
    apis: [],
    authentication: [],
    stateManagement: [],
    deployment: [],
    testing: [],
    styling: [],
    monorepo: false,
  };

  const add = (arr: string[], name: string) => {
    if (!arr.includes(name)) arr.push(name);
  };

  // Read all package.json files (monorepos have multiple)
  const pkgFiles = files.filter(
    (f) => basename(f.path) === "package.json" && !f.path.includes("node_modules")
  ).slice(0, 10);

  for (const pkgFile of pkgFiles) {
    try {
      const content = await readFile(pkgFile.absPath, "utf-8");
      const pkg = JSON.parse(content);
      const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

      // --- Frontend ---
      if (all["react"]) add(arch.frontend, "React");
      if (all["next"]) add(arch.frontend, "Next.js");
      if (all["vue"]) add(arch.frontend, "Vue");
      if (all["nuxt"]) add(arch.frontend, "Nuxt");
      if (all["@angular/core"]) add(arch.frontend, "Angular");
      if (all["svelte"]) add(arch.frontend, "Svelte");
      if (all["solid-js"]) add(arch.frontend, "SolidJS");
      if (all["@remix-run/react"] || all["remix"]) add(arch.frontend, "Remix");
      if (all["react-native"]) add(arch.frontend, "React Native");
      if (all["expo"]) add(arch.frontend, "Expo");

      // --- Backend ---
      if (all["express"]) add(arch.backend, "Express");
      if (all["fastify"]) add(arch.backend, "Fastify");
      if (all["@nestjs/core"]) add(arch.backend, "NestJS");
      if (all["hono"]) add(arch.backend, "Hono");
      if (all["koa"]) add(arch.backend, "Koa");
      if (all["@trpc/server"]) add(arch.backend, "tRPC");
      if (all["elysia"]) add(arch.backend, "Elysia (Bun)");

      // --- Database ---
      if (all["pg"] || all["postgres"]) add(arch.database, "PostgreSQL");
      if (all["mysql2"] || all["mysql"]) add(arch.database, "MySQL");
      if (all["mongoose"]) add(arch.database, "MongoDB");
      if (all["better-sqlite3"] || all["sqlite3"]) add(arch.database, "SQLite");
      if (all["ioredis"] || all["redis"]) add(arch.database, "Redis");
      if (all["@prisma/client"] || all["prisma"]) add(arch.database, "Prisma ORM");
      if (all["drizzle-orm"]) add(arch.database, "Drizzle ORM");
      if (all["typeorm"]) add(arch.database, "TypeORM");
      if (all["sequelize"]) add(arch.database, "Sequelize");
      if (all["@supabase/supabase-js"]) add(arch.database, "Supabase");
      if (all["firebase"] || all["firebase-admin"]) add(arch.database, "Firebase");
      if (all["@planetscale/database"]) add(arch.database, "PlanetScale");
      if (all["@vercel/postgres"]) add(arch.database, "Vercel Postgres");

      // --- APIs ---
      if (all["graphql"]) add(arch.apis, "GraphQL");
      if (all["@apollo/server"] || all["apollo-server"]) add(arch.apis, "Apollo Server");
      if (all["@apollo/client"]) add(arch.apis, "Apollo Client");
      if (all["@trpc/server"]) add(arch.apis, "tRPC");
      if (all["swagger-ui-express"] || all["@nestjs/swagger"]) add(arch.apis, "Swagger/OpenAPI");
      if (all["socket.io"]) add(arch.apis, "WebSockets (Socket.io)");
      if (all["ws"]) add(arch.apis, "WebSockets (ws)");

      // --- Authentication ---
      if (all["passport"]) add(arch.authentication, "Passport.js");
      if (all["@clerk/nextjs"] || all["@clerk/express"] || all["@clerk/clerk-sdk-node"]) add(arch.authentication, "Clerk");
      if (all["next-auth"] || all["@auth/core"] || all["@auth/express"]) add(arch.authentication, "Auth.js / NextAuth");
      if (all["jsonwebtoken"] || all["jose"]) add(arch.authentication, "JWT");
      if (all["bcrypt"] || all["bcryptjs"]) add(arch.authentication, "bcrypt");
      if (all["auth0"] || all["@auth0/nextjs-auth0"]) add(arch.authentication, "Auth0");
      if (all["firebase"] && all["firebase-admin"]) add(arch.authentication, "Firebase Auth");
      if (all["@supabase/supabase-js"]) add(arch.authentication, "Supabase Auth");
      if (all["lucia"] || all["oslo"]) add(arch.authentication, "Lucia");

      // --- State Management ---
      if (all["zustand"]) add(arch.stateManagement, "Zustand");
      if (all["redux"] || all["@reduxjs/toolkit"]) add(arch.stateManagement, "Redux");
      if (all["mobx"]) add(arch.stateManagement, "MobX");
      if (all["jotai"]) add(arch.stateManagement, "Jotai");
      if (all["recoil"]) add(arch.stateManagement, "Recoil");
      if (all["@tanstack/react-query"] || all["react-query"]) add(arch.stateManagement, "TanStack Query");
      if (all["swr"]) add(arch.stateManagement, "SWR");
      if (all["valtio"]) add(arch.stateManagement, "Valtio");
      if (all["nanostores"]) add(arch.stateManagement, "Nanostores");

      // --- Styling ---
      if (all["tailwindcss"]) add(arch.styling, "Tailwind CSS");
      if (all["@mui/material"] || all["@material-ui/core"]) add(arch.styling, "Material UI");
      if (all["@chakra-ui/react"]) add(arch.styling, "Chakra UI");
      if (all["@radix-ui/react-dialog"]) add(arch.styling, "Radix UI / shadcn");
      if (all["styled-components"]) add(arch.styling, "Styled Components");
      if (all["@emotion/react"]) add(arch.styling, "Emotion");
      if (all["antd"]) add(arch.styling, "Ant Design");
      if (all["framer-motion"]) add(arch.styling, "Framer Motion");

      // --- Testing ---
      if (all["jest"]) add(arch.testing, "Jest");
      if (all["vitest"]) add(arch.testing, "Vitest");
      if (all["@playwright/test"] || all["playwright"]) add(arch.testing, "Playwright");
      if (all["cypress"]) add(arch.testing, "Cypress");
      if (all["@testing-library/react"]) add(arch.testing, "Testing Library");
      if (all["supertest"]) add(arch.testing, "Supertest");
    } catch {
      // ignore parse errors in malformed package.json files
    }
  }

  // --- Python backend from requirements.txt ---
  const reqFile = files.find((f) => f.path === "requirements.txt");
  if (reqFile) {
    try {
      const content = await readFile(reqFile.absPath, "utf-8");
      if (/^fastapi\b/im.test(content)) add(arch.backend, "FastAPI");
      if (/^django\b/im.test(content)) add(arch.backend, "Django");
      if (/^flask\b/im.test(content)) add(arch.backend, "Flask");
      if (/^sqlalchemy\b/im.test(content)) add(arch.database, "SQLAlchemy");
      if (/^alembic\b/im.test(content)) add(arch.database, "Alembic");
      if (/^psycopg2\b/im.test(content) || /^asyncpg\b/im.test(content)) add(arch.database, "PostgreSQL");
      if (/^pymongo\b/im.test(content)) add(arch.database, "MongoDB");
      if (/^pyjwt\b/im.test(content) || /^python-jose\b/im.test(content)) add(arch.authentication, "JWT");
    } catch {}
  }

  // --- Rust backend from Cargo.toml ---
  const cargoFile = files.find((f) => f.path === "Cargo.toml");
  if (cargoFile) {
    try {
      const content = await readFile(cargoFile.absPath, "utf-8");
      if (content.includes("actix-web")) add(arch.backend, "Actix Web");
      if (content.includes("axum")) add(arch.backend, "Axum");
      if (content.includes("warp")) add(arch.backend, "Warp");
      if (content.includes("rocket")) add(arch.backend, "Rocket");
      if (content.includes("sqlx")) add(arch.database, "SQLx");
      if (content.includes("diesel")) add(arch.database, "Diesel ORM");
    } catch {}
  }

  // --- Deployment detection ---
  if (fileNames.has("Dockerfile") || fileNames.has(".dockerignore")) add(arch.deployment, "Docker");
  if (fileNames.has("docker-compose.yml") || fileNames.has("docker-compose.yaml")) add(arch.deployment, "Docker Compose");
  if (fileNames.has("vercel.json") || files.some((f) => f.path.endsWith(".vercel/project.json"))) add(arch.deployment, "Vercel");
  if (fileNames.has("netlify.toml")) add(arch.deployment, "Netlify");
  if (fileNames.has("fly.toml")) add(arch.deployment, "Fly.io");
  if (fileNames.has("render.yaml")) add(arch.deployment, "Render");
  if (fileNames.has("railway.json")) add(arch.deployment, "Railway");
  if (fileNames.has("Procfile")) add(arch.deployment, "Heroku");
  if (files.some((f) => f.path.includes(".github/workflows/"))) add(arch.deployment, "GitHub Actions");
  if (files.some((f) => f.path.includes("kubernetes/") || f.path.endsWith(".k8s.yaml") || f.path.includes("k8s/"))) add(arch.deployment, "Kubernetes");
  if (files.some((f) => f.path.endsWith(".tf"))) add(arch.deployment, "Terraform");

  // --- Monorepo detection ---
  arch.monorepo =
    fileNames.has("pnpm-workspace.yaml") ||
    fileNames.has("turbo.json") ||
    fileNames.has("nx.json") ||
    fileNames.has("lerna.json") ||
    fileNames.has("rush.json") ||
    fileNames.has("workspace.json") ||
    pkgFiles.length > 2;

  // --- OpenAPI spec detection ---
  if (files.some((f) => ["openapi.yaml", "openapi.json", "swagger.yaml", "swagger.json"].includes(basename(f.path)))) {
    add(arch.apis, "OpenAPI / Swagger");
  }

  return arch;
}
