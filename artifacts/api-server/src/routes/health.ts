import { Router, type IRouter } from "express";
import { isReady, getVersion } from "../lib/readiness";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  if (!isReady()) {
    res.status(503).json({ ok: false, version: "unknown" });
    return;
  }
  res.json({ ok: true, version: getVersion() });
});

export default router;
