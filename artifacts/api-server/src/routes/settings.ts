import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { settingsStore, AI_PROVIDERS } from "../store/index.js";

const router: IRouter = Router();

// GET /settings
router.get("/settings", (_req, res) => {
  res.json(settingsStore.get());
});

// PATCH /settings
router.patch("/settings", (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { activeProvider, theme, maxFileSizeMb, autoAnalyze, apiKey, apiKeyProvider } = parsed.data;

  const current = settingsStore.get();

  const patch: Partial<typeof current> = {};

  if (activeProvider !== undefined) {
    patch.activeProvider = activeProvider;
  }
  if (theme !== undefined && theme !== null) {
    patch.theme = theme as "light" | "dark" | "system";
  }
  if (maxFileSizeMb !== undefined && maxFileSizeMb !== null) {
    patch.maxFileSizeMb = maxFileSizeMb;
  }
  if (autoAnalyze !== undefined && autoAnalyze !== null) {
    patch.autoAnalyze = autoAnalyze;
  }
  if (apiKey !== undefined && apiKey !== null && apiKeyProvider !== undefined && apiKeyProvider !== null) {
    patch.apiKeys = { ...current.apiKeys, [apiKeyProvider]: apiKey };
    // Mark provider as configured
    if (!patch.activeProvider && !current.activeProvider) {
      patch.activeProvider = apiKeyProvider;
    }
  }

  const updated = settingsStore.update(patch);
  res.json(updated);
});

// GET /settings/providers
router.get("/settings/providers", (_req, res) => {
  const settings = settingsStore.get();

  const providers = AI_PROVIDERS.map((p) => ({
    ...p,
    status: settings.apiKeys[p.id]
      ? "configured"
      : p.status,
  }));

  res.json(providers);
});

export default router;
