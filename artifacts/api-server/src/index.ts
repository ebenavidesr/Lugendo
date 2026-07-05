import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";
import { setReady } from "./lib/readiness";
import { scheduleAdvisoryRefresh } from "./lib/travel-advisory-refresh";

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

runMigrations(migrationsFolder)
  .then(() => {
    logger.info("Migrations complete");
    setReady(buildVersion);
    scheduleAdvisoryRefresh();

    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — exiting");
    process.exit(1);
  });
