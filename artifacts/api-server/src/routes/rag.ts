/**
 * RAG routes
 *
 * POST   /rag/index/:jobId           — index a repository (fires background task)
 * DELETE /rag/index/:jobId           — delete an index
 * GET    /rag/index/:jobId/stats     — index statistics
 * POST   /rag/search/:jobId          — semantic search
 * POST   /rag/chat/:jobId            — RAG-augmented chat
 */

import { Router, type IRouter } from "express";
import { RAGService, RAGServiceError } from "../rag/index.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof RAGServiceError) {
    res.status(err.httpStatus).json({ error: err.code, message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[rag/routes] Unexpected error:", err);
  res.status(500).json({ error: "internal_error", message });
}

// ---------------------------------------------------------------------------
// POST /rag/index/:jobId
// Body (optional): { repoDir?: string }
// ---------------------------------------------------------------------------
router.post("/rag/index/:jobId", async (req, res) => {
  const { repoDir } = (req.body ?? {}) as { repoDir?: string };
  try {
    const result = await RAGService.indexJob(req.params.jobId, repoDir);
    res.status(202).json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /rag/index/:jobId
// ---------------------------------------------------------------------------
router.delete("/rag/index/:jobId", async (req, res) => {
  try {
    await RAGService.deleteIndex(req.params.jobId);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// GET /rag/index/:jobId/stats
// ---------------------------------------------------------------------------
router.get("/rag/index/:jobId/stats", async (req, res) => {
  try {
    const stats = await RAGService.getStats(req.params.jobId);
    res.json(stats);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /rag/search/:jobId
// Body: { query: string, topK?: number, minScore?: number,
//         filterPaths?: string[], filterLanguages?: string[] }
// ---------------------------------------------------------------------------
router.post("/rag/search/:jobId", async (req, res) => {
  const { query, topK, minScore, filterPaths, filterLanguages } =
    (req.body ?? {}) as {
      query?: string;
      topK?: number;
      minScore?: number;
      filterPaths?: string[];
      filterLanguages?: string[];
    };

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({
      error: "missing_field",
      message: "Request body must include a non-empty 'query' string.",
    });
    return;
  }

  if (topK !== undefined && (typeof topK !== "number" || topK < 1 || topK > 50)) {
    res.status(400).json({ error: "invalid_field", message: "'topK' must be a number between 1 and 50." });
    return;
  }

  try {
    const response = await RAGService.search(req.params.jobId, query.trim(), {
      topK: topK ?? 8,
      minScore: minScore ?? 0.0,
      filterPaths,
      filterLanguages,
    });
    res.json(response);
  } catch (err) {
    handleError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /rag/chat/:jobId
// Body: { message: string, topK?: number }
// ---------------------------------------------------------------------------
router.post("/rag/chat/:jobId", async (req, res) => {
  const { message, topK } =
    (req.body ?? {}) as { message?: string; topK?: number };

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({
      error: "missing_field",
      message: "Request body must include a non-empty 'message' string.",
    });
    return;
  }

  try {
    const result = await RAGService.ragChat(
      req.params.jobId,
      message.trim(),
      topK ?? 8
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
