import { Router } from "express";
import type { HealthStatus } from "@workspace/api-zod";

const router = Router();

router.get("/healthz", (_req, res) => {
  const data: HealthStatus = { status: "ok" };
  res.json(data);
});

export default router;