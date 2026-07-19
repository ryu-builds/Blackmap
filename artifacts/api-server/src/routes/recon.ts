import { Router, type IRouter } from "express";
import multer from "multer";
import {
  StartAnalysisBody,
  GetJobParams,
  DeleteJobParams,
  GetJobResultsParams,
} from "@workspace/api-zod";
import { jobStore, resultStore, settingsStore } from "../store/index.js";

const router: IRouter = Router();

// Multer: store uploaded ZIP in memory (buffered), max 150 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.mimetype === "application/octet-stream" ||
      file.originalname.endsWith(".zip")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are accepted"));
    }
  },
});

// ---------------------------------------------------------------------------
// POST /recon/analyze — start analysis from GitHub URL (JSON body)
// ---------------------------------------------------------------------------
router.post("/recon/analyze", (req, res) => {
  const parsed = StartAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { type, githubUrl, fileName, fileSize, description } = parsed.data;

  if (type === "github_url") {
    if (!githubUrl) {
      res.status(400).json({ error: "missing_field", message: "githubUrl is required for type github_url" });
      return;
    }
    const job = jobStore.create({
      type: "github_url",
      target: githubUrl,
      description: description ?? `GitHub analysis: ${githubUrl}`,
    });
    res.status(202).json(job);
    return;
  }

  // zip_upload via JSON body — no actual file bytes, just metadata
  // This path is a fallback; prefer POST /recon/upload with multipart for real files.
  if (type === "zip_upload") {
    if (!fileName) {
      res.status(400).json({ error: "missing_field", message: "fileName is required for type zip_upload" });
      return;
    }
    const maxMb = settingsStore.get().maxFileSizeMb;
    if (fileSize && fileSize > maxMb * 1024 * 1024) {
      res.status(400).json({
        error: "file_too_large",
        message: `File size ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds the ${maxMb}MB limit`,
      });
      return;
    }
    // Reject if no file bytes will ever arrive — the client should use /recon/upload
    res.status(400).json({
      error: "use_upload_endpoint",
      message: "For ZIP uploads, POST the file as multipart/form-data to /api/recon/upload",
    });
    return;
  }

  res.status(400).json({ error: "invalid_type", message: "Unknown analysis type" });
});

// ---------------------------------------------------------------------------
// POST /recon/upload — start analysis from an uploaded ZIP file (multipart)
// ---------------------------------------------------------------------------
router.post(
  "/recon/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "file_too_large", message: "File exceeds the 150 MB multer limit" });
        } else {
          res.status(400).json({ error: "upload_error", message: err.message });
        }
        return;
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "missing_file", message: "No file uploaded. Send a .zip as multipart/form-data with field name 'file'" });
      return;
    }

    const { originalname, size, buffer } = req.file;
    const maxMb = settingsStore.get().maxFileSizeMb;
    if (size > maxMb * 1024 * 1024) {
      res.status(400).json({
        error: "file_too_large",
        message: `Uploaded file (${(size / 1024 / 1024).toFixed(1)}MB) exceeds the configured limit of ${maxMb}MB`,
      });
      return;
    }

    const description = (req.body as Record<string, string>)?.description ?? `ZIP analysis: ${originalname}`;

    const job = jobStore.create({
      type: "zip_upload",
      target: originalname,
      description,
      zipBuffer: buffer,
    });

    res.status(202).json(job);
  }
);

// ---------------------------------------------------------------------------
// GET /recon/jobs
// ---------------------------------------------------------------------------
router.get("/recon/jobs", (_req, res) => {
  res.json(jobStore.list());
});

// ---------------------------------------------------------------------------
// GET /recon/jobs/:jobId
// ---------------------------------------------------------------------------
router.get("/recon/jobs/:jobId", (req, res) => {
  const parsed = GetJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const job = jobStore.get(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ error: "not_found", message: "Job not found" });
    return;
  }

  res.json(job);
});

// ---------------------------------------------------------------------------
// DELETE /recon/jobs/:jobId
// ---------------------------------------------------------------------------
router.delete("/recon/jobs/:jobId", (req, res) => {
  const parsed = DeleteJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const deleted = jobStore.delete(parsed.data.jobId);
  if (!deleted) {
    res.status(404).json({ error: "not_found", message: "Job not found" });
    return;
  }

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /recon/jobs/:jobId/results
// ---------------------------------------------------------------------------
router.get("/recon/jobs/:jobId/results", (req, res) => {
  const parsed = GetJobResultsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const job = jobStore.get(parsed.data.jobId);
  if (!job) {
    res.status(404).json({ error: "not_found", message: "Job not found" });
    return;
  }

  const result = resultStore.get(parsed.data.jobId);
  if (!result) {
    res.status(404).json({
      error: "results_unavailable",
      message: job.status === "completed" ? "Results not found" : `Analysis is ${job.status}`,
    });
    return;
  }

  res.json(result);
});

export default router;
