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
 * Directly add any columns that may be missing in production databases that
 * were created before these columns were introduced. Uses ADD COLUMN IF NOT
 * EXISTS so it is completely idempotent — a no-op when columns already exist.
 * Runs unconditionally at every startup (negligible overhead).
 */
async function ensureProductionColumns(): Promise<void> {
  // Skip entirely if trip_day_activities does not yet exist — this happens on a
  // fresh database where migrate() will create all tables with all columns.
  const { rows: check } = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trip_day_activities'
    ) AS exists
  `);
  if (!check[0]?.exists) return;

  const alterations = [
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS address text`,
    `ALTER TABLE trips ADD COLUMN IF NOT EXISTS description text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS activity_title text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS end_time text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS company_contact text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS address_override text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS included boolean NOT NULL DEFAULT true`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS transport_mode text`,
    `ALTER TABLE trip_day_activities ADD COLUMN IF NOT EXISTS created_by_user_id integer`,
  ];
  for (const sql of alterations) {
    await pool.query(sql);
  }
  // FK constraint — idempotent via exception handler
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE trip_day_activities
        ADD CONSTRAINT trip_day_activities_created_by_user_id_users_id_fk
        FOREIGN KEY (created_by_user_id) REFERENCES users(id);
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);
}

/**
 * Stamp the baseline migration as applied if the database already has tables
 * (i.e., was previously managed by drizzle-kit push or another tool).
 * This is idempotent — safe to call even if already stamped.
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
 * Run all pending Drizzle migrations against the connected database.
 * Pass the absolute path to the migrations folder (needed so the bundled
 * server can locate the SQL files copied next to the bundle at build time).
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  await ensureProductionColumns();
  await stampBaselineIfNeeded(migrationsFolder);
  await migrate(db, { migrationsFolder });
}

export * from "./schema";
