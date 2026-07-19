/**
 * AI Analysis routes
 *
 * POST   /ai/reports/:jobId/generate            — start full AI analysis
 * GET    /ai/reports/:jobId                     — get all reports (with status)
 * GET    /ai/reports/:jobId/:section            — get a single report section
 * POST   /ai/reports/:jobId/:section/regenerate — regenerate one section
 * POST   /ai/chat/:jobId                        — send a chat message
 * GET    /ai/chat/:jobId                        — get chat history
 * DELETE /ai/chat/:jobId                        — clear chat history
 */

import { Router, type IRouter } from "express";
import { AIService, AIServiceError } from "../ai/index.js";
import type { ReportSectionKey } from "../ai/reports/types.js";

const router: IRouter = Router();

const VALID_SECTIONS: ReportSectionKey[] = [
  "executiveSummary",
  "architecture",
  "folderWalkthrough",
  "onboarding",
  "dependencies",
  "risks",
  "markdown",
];

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof AIServiceError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[ai/routes] Unexpected error:", err);
  res.status(500).json({ error: "internal_error", message });
}

// ---------------------------------------------------------------------------
// POST /ai/reports/:jobId/generate
// ---------------------------------------------------------------------------
router.post("/ai/reports/:jobId/generate", async (req, res) => {
  try {
    const result = await AIService.startReportGeneration(req.params.jobId);
    res.status(202).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// GET /ai/reports/:jobId
// ---------------------------------------------------------------------------
router.get("/ai/reports/:jobId", (req, res) => {
  try {
    const reports = AIService.getReports(req.params.jobId);
    res.json(reports);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// GET /ai/reports/:jobId/:section
//
// Supported section names (camelCase or kebab-case accepted):
//   executive-summary | executiveSummary
//   architecture
//   folder-walkthrough | folderWalkthrough
//   onboarding
//   dependencies
//   risks
//   markdown
// ---------------------------------------------------------------------------
router.get("/ai/reports/:jobId/:section", (req, res) => {
  // Normalise kebab-case → camelCase
  const raw = req.params.section;
  const key = raw.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as ReportSectionKey;

  if (!VALID_SECTIONS.includes(key)) {
    res.status(400).json({
      error: "invalid_section",
      message: `Unknown section "${raw}". Valid sections: ${VALID_SECTIONS.join(", ")}`,
    });
    return;
  }

  try {
    const section = AIService.getReportSection(req.params.jobId, key);

    // For the markdown section return plain text when data is available
    if (key === "markdown" && section.status === "complete" && section.data) {
      res.type("text/markdown").send(section.data);
      return;
    }

    res.json(section);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/reports/:jobId/:section/regenerate
// ---------------------------------------------------------------------------
router.post("/ai/reports/:jobId/:section/regenerate", async (req, res) => {
  const raw = req.params.section;
  const key = raw.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as ReportSectionKey;

  if (!VALID_SECTIONS.includes(key)) {
    res.status(400).json({
      error: "invalid_section",
      message: `Unknown section "${raw}".`,
    });
    return;
  }

  try {
    await AIService.regenerateSection(req.params.jobId, key);
    res.status(202).json({ started: true, section: key, jobId: req.params.jobId });
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/chat/:jobId
// Body: { message: string }
// ---------------------------------------------------------------------------
router.post("/ai/chat/:jobId", async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "missing_field", message: "Request body must include a non-empty 'message' string." });
    return;
  }

  try {
    const result = await AIService.chat(req.params.jobId, message.trim());
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// GET /ai/chat/:jobId
// ---------------------------------------------------------------------------
router.get("/ai/chat/:jobId", (req, res) => {
  try {
    const history = AIService.getChatHistory(req.params.jobId);
    res.json(history);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /ai/chat/:jobId
// ---------------------------------------------------------------------------
router.delete("/ai/chat/:jobId", (req, res) => {
  try {
    AIService.clearChatHistory(req.params.jobId);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
