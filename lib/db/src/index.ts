import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fail fast if the DB connection pool is exhausted (e.g. orphaned connections
  // from a previous process after SIGTERM). Without a timeout, pool.query()
  // hangs indefinitely, blocking migrations and delaying startup by hours.
  connectionTimeoutMillis: 10000,
  // Keep the pool small to avoid exhausting Replit's managed DB connection limit.
  max: 3,
});
export const db = drizzle(pool, { schema });

/**
 * Stamp the baseline migration (index 0) as applied if the database already
 * has tables — i.e. was previously managed by drizzle-kit push or another tool.
 * This is idempotent and safe to call on every startup.
 */
async function stampBaselineIfNeeded(migrationsFolder: string): Promise<void> {
  let baselineFile: string | undefined;
  try {
    const files = readdirSync(migrationsFolder)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    if (files.length === 0) return;
    baselineFile = join(migrationsFolder, files[0]);
  } catch {
    return;
  }

  let baselineSql: string;
  try {
    baselineSql = readFileSync(baselineFile, "utf-8");
  } catch {
    return;
  }

  const hash = createHash("sha256").update(baselineSql).digest("hex");

  const { rows: tableCheck } = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agencies'
    ) AS exists
  `);

  if (!tableCheck[0]?.exists) {
    return; // Fresh database — let migrate() create everything
  }

  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
    [hash],
  );

  if (existing.length === 0) {
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
  }
}

/**
 * For each migration file after the baseline, check whether its DDL effects
 * are already present in the database. If so, stamp it as applied in drizzle's
 * tracking table so migrate() skips running it.
 *
 * This handles migrations (like 0001) whose SQL was previously applied via
 * the now-removed ensureProductionColumns() startup shim. Without this,
 * migrate() would re-run ALTER TABLE statements that hang on ACCESS EXCLUSIVE
 * locks in production when existing connections are present.
 *
 * Sentinels are cheap SELECT EXISTS queries — never DDL — so they can't block.
 */
async function stampAlreadyAppliedMigrationsIfNeeded(
  migrationsFolder: string,
): Promise<void> {
  // Map from migration file index (0-based, sorted) to a sentinel query.
  // The query must return a single row with an `applied` boolean column.
  // Only list migrations that used idempotent DDL (IF NOT EXISTS) and whose
  // effects may already be present from a previous shim or push.
  const sentinels: Record<number, string> = {
    // 0001_add_post_baseline_columns.sql — ALTER TABLE … ADD COLUMN IF NOT EXISTS
    // Previously applied by ensureProductionColumns(); columns already exist in prod.
    1: `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'activities'
            AND column_name  = 'address'
        ) AS applied`,
    // 0002_wonderful_mimic.sql — CREATE TABLE trip_documents
    // Sentinel guards against the table existing from another path.
    2: `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name   = 'trip_documents'
        ) AS applied`,
  };

  let files: string[];
  try {
    files = readdirSync(migrationsFolder)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return;
  }

  for (let i = 1; i < files.length; i++) {
    const sentinel = sentinels[i];
    if (!sentinel) continue;

    const filePath = join(migrationsFolder, files[i]);
    let sql: string;
    try {
      sql = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const hash = createHash("sha256").update(sql).digest("hex");

    // Skip if already tracked
    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
      [hash],
    );
    if (existing.length > 0) continue;

    // Check if migration's effects are already present
    const { rows: sentinelResult } =
      await pool.query<{ applied: boolean }>(sentinel);
    if (!sentinelResult[0]?.applied) continue; // Not yet applied — let migrate() handle it

    // Stamp as applied so migrate() skips it
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
  }
}

/**
 * Run all pending Drizzle migrations against the connected database.
 * Pass the absolute path to the migrations folder (needed so the bundled
 * server can locate the SQL files copied next to the bundle at build time).
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  await stampBaselineIfNeeded(migrationsFolder);
  await stampAlreadyAppliedMigrationsIfNeeded(migrationsFolder);
  await migrate(db, { migrationsFolder });
}

export * from "./schema";
