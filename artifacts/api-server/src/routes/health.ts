import { Router, type IRouter } from "express";
import { isReady, getVersion } from "../lib/readiness";

const router: IRouter = Router();

// This endpoint is polled by the platform's deploy health check during the
// "promote" step. It must return 200 as soon as the process is listening,
// otherwise a slow migration/init step can push us past the startup window
// and the deploy is aborted ("required port was never opened"). Whether the
// app has actually finished startup work (migrations, etc.) is reported via
// `ready` in the body instead of the HTTP status, so real traffic can check
// readiness separately without blocking the deploy promote step.
router.get("/healthz", (_req, res) => {
    res.json({ ok: true, ready: isReady(), version: getVersion() });
});

export default router;