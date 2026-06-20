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

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Stamp the baseline migration as applied if the database already has tables
 * (i.e., was previously managed by drizzle-kit push or another tool).
 * This is idempotent — safe to call even if already stamped.
 */
async function stampBaselineIfNeeded(migrationsFolder: string): Promise<void> {
  // Find the baseline SQL file (the lexicographically first .sql file)
  let baselineFile: string | undefined;
  try {
    const files = readdirSync(migrationsFolder)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    if (files.length === 0) return;
    baselineFile = join(migrationsFolder, files[0]);
  } catch {
    return; // migrations folder not found — let migrate() handle it
  }

  let baselineSql: string;
  try {
    baselineSql = readFileSync(baselineFile, "utf-8");
  } catch {
    return;
  }

  const hash = createHash("sha256").update(baselineSql).digest("hex");

  // Check whether the app tables already exist (existing DB indicator)
  const { rows: tableCheck } = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agencies'
    ) AS exists
  `);

  if (!tableCheck[0]?.exists) {
    // Fresh database — let migrate() create everything from scratch
    return;
  }

  // Existing DB — ensure tracking infrastructure exists and baseline is stamped
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
 * Run all pending Drizzle migrations against the connected database.
 * Pass the absolute path to the migrations folder (needed so the bundled
 * server can locate the SQL files copied next to the bundle at build time).
 *
 * Automatically stamps the baseline migration as applied if the database
 * already has existing tables (e.g., previously managed by drizzle-kit push),
 * so the first production deploy never fails trying to re-create existing tables.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  await stampBaselineIfNeeded(migrationsFolder);
  await migrate(db, { migrationsFolder });
}

export * from "./schema";
