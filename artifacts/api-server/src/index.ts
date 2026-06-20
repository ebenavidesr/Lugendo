import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db";

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

runMigrations(migrationsFolder)
  .then(() => {
    logger.info("Migrations complete");

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
