---
name: AI Analysis Layer
description: Architecture of the AI analysis layer in BlackMap Recon — providers, prompts, reports, chat, and REST endpoints
---

## Module layout (artifacts/api-server/src/ai/)

```
ai/
  providers/
    base.ts        — AIProvider interface + ChatMessage + ProviderNotConfiguredError
    openai.ts      — OpenAIProvider (gpt-4o)
    anthropic.ts   — AnthropicProvider (claude-3-5-sonnet-20241022)
    gemini.ts      — GeminiProvider (gemini-2.0-flash) — uses @google/genai, flattens messages to prompt string
    factory.ts     — createProvider(settings) — reads activeProvider + apiKeys from settingsStore
  prompts/
    context.ts     — PromptContext type + serialiseContext() (truncates file tree to 150 paths)
    templates.ts   — 8 pure template functions returning ChatMessage[]
  reports/
    types.ts       — AllReports, ReportSection<T>, 7 typed report interfaces
    store.ts       — in-memory Map<jobId, AllReports> with per-section status tracking
    generator.ts   — sequential generation of 6 JSON reports + 1 markdown; partial results saved as each completes
  chat/
    session.ts     — in-memory chat history per jobId; prepends last 20 turns to every call
  index.ts         — AIService facade with AIServiceError (code + httpStatus)
```

## REST Endpoints

All under `/api/ai/`:
- `POST /ai/reports/:jobId/generate` → 202, fires background generation
- `GET  /ai/reports/:jobId` → AllReports (with per-section status)
- `GET  /ai/reports/:jobId/:section` → single ReportSection (markdown returns text/markdown)
- `POST /ai/reports/:jobId/:section/regenerate` → 202, re-runs one section
- `POST /ai/chat/:jobId` body: `{message}` → `{reply, sessionId}`
- `GET  /ai/chat/:jobId` → chat history
- `DELETE /ai/chat/:jobId` → 204

Section names accept both camelCase and kebab-case (normalised in route handler).

## Adding a new provider

1. Implement `AIProvider` in a new file in `providers/`
2. Add a `case` to `factory.ts`'s switch statement
3. No other files change

## Key decisions

**Why sequential report generation (not parallel):**
Sequential allows each section to complete and be persisted before the next starts, so partial results are available even if the run is interrupted or a section fails. Token budgets also benefit from not saturating concurrent requests.

**Why Gemini flattens messages:**
The `@google/genai` v2 SDK's `generateContent` takes a single `contents` string or structured parts. We concatenate all turns with role labels so the full system prompt + conversation history is preserved without needing the chat-session API.

**Prompt template contract:**
Each template is a pure function `(ctx: PromptContext, ...) => ChatMessage[]`. Templates include JSON schema in the system message so any provider produces parseable output. The `extractJson()` helper handles providers that wrap JSON in markdown fences.

**RepoIntelligence consumed, not modified:**
The AI layer only reads from `resultStore.get(jobId).repoIntelligence`. The engine is never touched.

## Verified behavior

- No provider configured → 422 with `provider_not_configured`
- Invalid job → 404 with `job_not_found`
- Job not completed → 409 with `job_not_completed`
- Provider configured with bad key → 202 immediately; sections show `status: "error"` with OpenAI's actual 401 message; `overallStatus: "partial"`
- DELETE /ai/chat/:jobId → 204
- Section name normalisation: `executive-summary` → `executiveSummary`
