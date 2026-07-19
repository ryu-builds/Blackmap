---
name: Recon Engine Architecture
description: How the real repository analysis engine works in BlackMap Recon — modules, data flow, and key decisions
---

## Engine Modules (artifacts/api-server/src/engine/)

- `clone.ts` — validates github.com URLs (safe chars only), shallow `git clone --depth 1` into a mkdtemp dir
- `extract.ts` — multer-buffered ZIP → AdmZip, Zip Slip prevention (resolve + startsWith check), per-entry size cap, cleanup on failure
- `walker.ts` — recursive readdir (uses `readdir()` + separate `stat()` per entry — avoids TS overload bug with `withFileTypes`), respects IGNORE_DIRS, caps at 10k files, reads text files ≤2MB for line counts
- `detector.ts` — language stats by extension, framework detection from package.json/requirements.txt/Cargo.toml, package manager + build system detection from lock/config files
- `architect.ts` — reads all package.json files (up to 10 in monorepos), produces ArchitectureInfo: frontend/backend/database/apis/auth/stateManagement/deployment/testing/styling/monorepo
- `findings.ts` — pattern-based findings (no AI): .env committed, missing .gitignore, conflicting lock files, missing .dockerignore, secret regex patterns (API keys, JWT, AWS, Stripe, GitHub tokens, private keys), eval(), exec(), disabled TLS, TODO security comments, large source files; console.log findings capped at 5
- `index.ts` — orchestrator: acquire source → walk → detect (parallel) → findings → assemble AnalysisResult + RepoIntelligence

## Key Decisions

**Why readdir without withFileTypes:**
Using `readdir(dir)` + `stat(path)` per entry instead of `readdir(dir, { withFileTypes: true })` because newer `@types/node` returns `Dirent<NonSharedBuffer>[]` for the withFileTypes overload, causing TS errors when entries are used as strings. The stat-based approach is clean and unambiguous.

**Why multer memoryStorage for ZIP:**
Keeps the zip bytes as a Buffer in memory; avoids temporary disk files managed by multer (we manage our own tmpdir in extract.ts and always clean up in a finally block).

**ZIP upload endpoint:**
`POST /api/recon/upload` accepts multipart/form-data with field name `file`. The original `POST /api/recon/analyze` with JSON body now rejects zip_upload type and redirects to the upload endpoint.

**Frontend ZIP change:**
`handleStart` in `artifacts/blackmap-recon/src/pages/recon/index.tsx` uses `FormData` + fetch to `${BASE_URL}api/recon/upload` for ZIP tab; GitHub tab still uses the `useStartAnalysis` mutation.

**repoIntelligence field:**
`AnalysisResult` has an optional `repoIntelligence?: RepoIntelligence` field added to the store type. The API returns it alongside all existing fields. The UI does not render it yet — it's structured JSON ready for the next phase.

## Verified Performance

Real test: `expressjs/express` — 213 files, 26,538 lines, 9 findings, ~1.2 seconds end-to-end including clone.
