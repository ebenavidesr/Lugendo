import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";

const app: Express = express();

// Trust the first proxy (Replit's reverse proxy). Without this, Express
// doesn't see the X-Forwarded-Proto: https header and refuses to set
// secure cookies, breaking sessions in production.
app.set("trust proxy", 1);

// Registered before ANY other middleware (pinoHttp, cors, body parsers, session) so the
// deploy platform's health check can never be affected by something going wrong further
// down the chain -- e.g. connect-pg-simple's session store doing its own DB work on every
// request, or a CORS/body-parser edge case. This is deliberately redundant with the
// /api/healthz route registered via routes/health.ts further down; that one still exists
// for anything else that depends on the same path, but this one always wins because it's
// registered first. Also covers the bare /api path -- deploy logs report failures as
// "healthcheck /api returned status 500", which may mean the platform probes /api itself
// rather than /api/healthz.
app.get(["/api", "/api/healthz"], (_req, res) => {
  res.json({ ok: true });
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(sessionMiddleware);

app.use("/api", router);

// Catch-all error handler. Without this, an error thrown or passed to
// next(err) anywhere upstream (session store, CORS, body parsing, or any
// route) falls through to Express's built-in handler, which sends a bare
// 500 and — critically — never logs the underlying error. That made a
// production healthcheck failure completely silent: the platform saw
// "/api/healthz returned 500" but nothing in our logs said why. This
// middleware must be registered last (4-arg signature is what makes
// Express treat it as an error handler) so it logs the real error on every
// path before responding.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const log = req.log ?? logger;
  log.error({ err }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
