import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reconRouter from "./recon";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import aiRouter from "./ai";
import ragRouter from "./rag";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reconRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(aiRouter);
router.use(ragRouter);

export default router;
