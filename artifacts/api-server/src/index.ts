import fs from "node:fs";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { setReady } from "./lib/readiness";
import { scheduleAdvisoryRefresh } from "./lib/travel-advisory-refresh";

// Diagnostic instrumentation added after repeated silent Autoscale promote
// failures where pino's buffered/async stdout writes appeared to stop after
// exactly one line, with no crash and no further logs ever surfacing.
// `fs.writeSync` bypasses any logger buffering/transport entirely — it's a
// raw, synchronous syscall — so if these lines are also missing from deploy
// logs, the problem is in the platform's log capture, not our logging setup.
// __BUILD_ID__ (an ISO timestamp baked in at build time, see build.mjs) lets
// us confirm a failed deploy actually ran the latest build and isn't serving
// a stale cached bundle.
fs.writeSync(1, `BUILD ${__BUILD_ID__}\n`);
setInterval(() => {
  fs.writeSync(2, `heartbeat ${new Date().toISOString()}\n`);
}, 1000).unref();

// First line executed after all module imports resolve. If a future deploy
// hangs before this line ever appears in the logs, the problem is in module
// loading / process bootstrap (upstream of our code — infra, not app logic).
// If it appears but nothing after it does, the problem is in the code below.
logger.info("Boot: modules loaded, starting up");

// Surface any error that would otherwise be swallowed silently (e.g. a
// rejection from code with no attached .catch, or a throw outside any
// try/catch) as a loud, logged exit instead of an indefinite silent hang
// that only ends when the platform's deploy healthcheck times out.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting");
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled rejection — exiting");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Resolve the migrations folder relative to this file.
// In production the build copies lib/db/migrations/ next to the bundle,
// so __dirname points at the same dist/ directory as the SQL files.
const migrationsFolder = path.join(__dirname, "migrations");

logger.info({ migrationsFolder }, "Running database migrations");

const buildVersion =
  process.env["BUILD_VERSION"] ??
  process.env["npm_package_version"] ??
  "dev";

runMigrations(migrationsFolder, (step) => {
  logger.info({ step }, "Migration progress");
})
  .then(() => {
    logger.info("Migrations complete");
    setReady(buildVersion);
    scheduleAdvisoryRefresh();

    // Bind explicitly to 0.0.0.0 (IPv4) rather than letting Node default to
    // `::` (IPv6 dual-stack). The platform's port-detection has a fallback
    // path that reads /proc/net/tcp (IPv4-only sockets) when its primary
    // (seccomp-based) detection is unavailable — a server bound to `::` is
    // invisible to that fallback even though it's listening and healthy.
    const server = app.listen(port, "0.0.0.0", () => {
      logger.info({ port }, "Server listening");
      fs.writeSync(1, `LISTENING port=${port}\n`);
    });

    // `app.listen`'s own callback only ever fires on success — a bind
    // failure (e.g. EADDRINUSE from a leftover process still holding the
    // port) is reported via the server's 'error' event instead. Without
    // this handler, that error had no listener, which makes Node throw it
    // as an uncaught exception from inside the net module's internals —
    // logged, if at all, with no indication it was a listen failure.
    server.on("error", (err) => {
      logger.error({ err, port }, "Error listening on port");
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — exiting");
    process.exit(1);
  });
