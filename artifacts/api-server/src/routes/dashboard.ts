import { Router, type IRouter } from "express";
import { jobStore, resultStore } from "../store/index.js";

const router: IRouter = Router();

// GET /dashboard/summary
router.get("/dashboard/summary", (_req, res) => {
  const allJobs = jobStore.list();

  const completedJobs = allJobs.filter((j) => j.status === "completed");
  const runningJobs = allJobs.filter((j) => j.status === "running" || j.status === "queued");
  const failedJobs = allJobs.filter((j) => j.status === "failed");

  let totalFindings = 0;
  let criticalFindings = 0;

  for (const job of completedJobs) {
    const result = resultStore.get(job.id);
    if (result) {
      totalFindings += result.totalFindings;
      criticalFindings += result.criticalCount;
    }
  }

  const recentJobs = allJobs.slice(0, 5);

  res.json({
    totalAnalyses: allJobs.length,
    completedAnalyses: completedJobs.length,
    runningAnalyses: runningJobs.length,
    failedAnalyses: failedJobs.length,
    totalFindings,
    criticalFindings,
    recentJobs,
  });
});

export default router;
