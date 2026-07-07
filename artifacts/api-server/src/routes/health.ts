import { Router, type IRouter } from "express";
import { isReady, getVersion } from "../lib/readiness";

const router: IRouter = Router();

// Liveness: return 200 as soon as the process is listening, WITHOUT waiting
// for migrations/init to finish. This is what the deploy health-check polls,
// so it must succeed the moment the port is open. The `ready` flag still
// reports whether migrations have completed (real API traffic is gated on it
// elsewhere), so this endpoint stays useful for observability.
router.get("/healthz", (_req, res) => {
  res.json({ ok: true, ready: isReady(), version: getVersion() });
});

export default router;
