/**
 * Prompt templates — pure functions that return ChatMessage[].
 *
 * Rules:
 *  - No provider-specific code.
 *  - No hardcoded project names.
 *  - Every template receives PromptContext and returns ChatMessage[].
 *  - JSON-output templates include a strict schema description so any
 *    provider can be coerced to produce parseable output.
 *  - The markdown template returns raw markdown (not JSON).
 */

import type { ChatMessage } from "../providers/base.js";
import type { PromptContext } from "./context.js";
import { serialiseContext } from "./context.js";
import type { AllReports } from "../reports/types.js";

// ---------------------------------------------------------------------------
// Shared preamble injected into every report template
// ---------------------------------------------------------------------------
const ANALYST_PERSONA = `You are a senior software architect and security engineer with 20+ years of experience
reviewing production codebases. You produce concise, accurate, technically sound analysis.
Never hallucinate file paths, dependencies, or technologies that are not present in the
provided repository intelligence. If something is unclear, say so explicitly.`;

const JSON_REMINDER = `Respond with ONLY valid JSON. No markdown fences, no prose before or after.
If a section does not apply (e.g. no database found), set that field to null.`;

// ---------------------------------------------------------------------------
// 1. Executive Summary
// ---------------------------------------------------------------------------
export function executiveSummaryTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: produce an executive summary of the analysed repository.

Output schema (strict):
{
  "projectName": string,            // inferred name of the project
  "projectDescription": string,     // 2-3 sentence plain-English description
  "primaryPurpose": string,         // one sentence
  "complexity": "simple" | "moderate" | "complex" | "very-complex",
  "complexityRationale": string,    // 1-2 sentences explaining the rating
  "recommendedAudience": string,    // who this project is designed for
  "keyTechnologies": string[],      // top 6-8 technologies
  "highlights": string[],           // 3-5 positive aspects
  "concerns": string[],             // 2-4 noteworthy concerns (if any)
  "overallAssessment": string       // 3-4 sentence balanced summary
}`,
    },
    {
      role: "user",
      content: `Analyse this repository and produce the executive summary JSON.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 2. Architecture Report
// ---------------------------------------------------------------------------
export function architectureReportTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: produce a detailed architecture report.

Output schema (strict):
{
  "overview": string,
  "frontend": {
    "description": string,
    "technologies": string[],
    "patterns": string[]        // e.g. SPA, SSR, component-driven, atomic design
  } | null,
  "backend": {
    "description": string,
    "technologies": string[],
    "patterns": string[]        // e.g. REST, MVC, middleware chain, microservices
  } | null,
  "database": {
    "description": string,
    "technologies": string[],
    "patterns": string[]        // e.g. ORM, migrations, connection pooling
  } | null,
  "authentication": {
    "description": string,
    "approach": string,         // e.g. JWT, session, OAuth2, magic-link
    "technologies": string[]
  } | null,
  "apis": {
    "description": string,
    "style": string,            // e.g. REST, GraphQL, tRPC, gRPC
    "technologies": string[]
  } | null,
  "deployment": {
    "description": string,
    "platform": string,
    "technologies": string[]
  } | null,
  "monorepo": boolean,
  "architecturePatterns": string[],   // high-level patterns across the whole system
  "recommendations": string[]         // 2-5 actionable architectural improvements
}`,
    },
    {
      role: "user",
      content: `Analyse this repository architecture.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 3. Folder Walkthrough
// ---------------------------------------------------------------------------
export function folderWalkthroughTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: explain the purpose of every meaningful directory in this repository.
Focus on directories with meaningful code. Skip auto-generated folders.

Output schema (strict):
{
  "overview": string,
  "directories": [
    {
      "name": string,           // directory path relative to root (e.g. "src/api")
      "purpose": string,        // what this directory is responsible for
      "importance": "critical" | "important" | "supporting" | "auxiliary",
      "keyFiles": string[],     // 2-5 most important files inside (relative paths)
      "notes": string           // any patterns, conventions, or gotchas to know
    }
  ]
}`,
    },
    {
      role: "user",
      content: `Walk through all meaningful directories in this repository.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 4. Developer Onboarding
// ---------------------------------------------------------------------------
export function developerOnboardingTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: produce a developer onboarding guide based on the repository structure.
Be specific and practical. A new developer should be able to follow this immediately.

Output schema (strict):
{
  "overview": string,
  "entryPoints": [
    { "path": string, "description": string }
  ],
  "requestFlow": string,        // prose: how a typical request flows through the system
  "buildProcess": string,       // prose: how to build, test, and run the project
  "environmentVariables": [
    { "name": string, "purpose": string, "required": boolean }
  ],
  "developmentWorkflow": string,
  "quickStart": string[],       // ordered list of commands/steps to get running
  "gotchas": string[]           // 2-5 non-obvious things that trip up new developers
}`,
    },
    {
      role: "user",
      content: `Generate a developer onboarding guide for this repository.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 5. Dependency Analysis
// ---------------------------------------------------------------------------
export function dependencyAnalysisTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: analyse the major dependencies and frameworks in this repository.
Only cover libraries that are actually present in the repository intelligence.
Do not invent dependencies.

Output schema (strict):
{
  "overview": string,
  "dependencies": [
    {
      "name": string,
      "category": "frontend" | "backend" | "database" | "testing" | "tooling" | "other",
      "purpose": string,
      "alternatives": string[],     // 2-3 common alternatives
      "reasoning": string,          // why this library is likely used here
      "riskLevel": "low" | "medium" | "high"
    }
  ],
  "licenseConsiderations": string,
  "updateRecommendations": string
}`,
    },
    {
      role: "user",
      content: `Analyse the dependencies in this repository.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 6. Risk Summary
// ---------------------------------------------------------------------------
export function riskSummaryTemplate(ctx: PromptContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

${JSON_REMINDER}

Your task: produce a risk summary combining ALL the static analysis findings.
For each finding, provide a plain-English explanation and concrete remediation steps.

Output schema (strict):
{
  "overallRisk": "low" | "medium" | "high" | "critical",
  "overview": string,
  "findings": [
    {
      "severity": string,
      "title": string,
      "explanation": string,      // plain English, 2-3 sentences
      "remediation": string,      // specific, actionable steps
      "category": string,
      "file": string | null,
      "line": number | null
    }
  ],
  "criticalActions": string[],    // top 3-5 things to fix immediately
  "recommendations": string[]     // broader security/quality improvements
}`,
    },
    {
      role: "user",
      content: `Produce a risk summary for these findings.\n\nRepository Intelligence:\n${serialiseContext(ctx)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 7. Markdown Report
// ---------------------------------------------------------------------------
export function markdownReportTemplate(ctx: PromptContext, reports: Partial<AllReports>): ChatMessage[] {
  const reportsJson = JSON.stringify(
    {
      executiveSummary: reports.executiveSummary,
      architecture: reports.architecture,
      folderWalkthrough: reports.folderWalkthrough,
      onboarding: reports.onboarding,
      dependencies: reports.dependencies,
      risks: reports.risks,
    },
    null,
    2
  );

  return [
    {
      role: "system",
      content: `${ANALYST_PERSONA}

Your task: produce a beautiful, well-structured Markdown report that synthesises
all the AI-generated reports and the raw repository intelligence.

Rules:
- Use clear headings (H1, H2, H3).
- Use tables where they aid readability (e.g. language breakdown, findings).
- Use code blocks for file paths and commands.
- Use emoji sparingly (only for severity badges and section icons).
- Do NOT wrap the output in a markdown fence — return raw markdown directly.
- Total length: aim for 800-1400 words.
- Include all major sections: Executive Summary, Architecture, Directory Guide,
  Developer Onboarding, Dependencies, Risk Summary.`,
    },
    {
      role: "user",
      content: `Generate the Markdown report.\n\nRepository Intelligence:\n${serialiseContext(ctx)}\n\nGenerated Reports:\n${reportsJson}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 8. Chat — context builder for interactive Q&A
// ---------------------------------------------------------------------------
export function chatSystemMessage(ctx: PromptContext, reports: Partial<AllReports>): ChatMessage {
  const reportsJson = JSON.stringify(
    {
      executiveSummary: reports.executiveSummary ?? null,
      architecture: reports.architecture ?? null,
      folderWalkthrough: reports.folderWalkthrough ?? null,
      onboarding: reports.onboarding ?? null,
      dependencies: reports.dependencies ?? null,
      risks: reports.risks ?? null,
    },
    null,
    2
  );

  return {
    role: "system",
    content: `${ANALYST_PERSONA}

You are answering questions about a specific software repository.
Use ONLY the information in the Repository Intelligence and Generated Reports below.
If the answer cannot be determined from the available data, say so explicitly —
do not guess or fabricate details.

Answer concisely but thoroughly. Use markdown formatting for code paths and snippets.

Repository Intelligence:
${serialiseContext(ctx)}

Generated Reports:
${reportsJson}`,
  };
}
