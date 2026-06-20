import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const BASELINE_SQL_PATH = join(
  __dirname,
  "..",
  "migrations",
  "0000_absurd_vargas.sql",
);
const baselineSql = readFileSync(BASELINE_SQL_PATH, "utf-8");
const BASELINE_HASH = createHash("sha256").update(baselineSql).digest("hex");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows: tableCheck } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'agencies'
    ) AS exists
  `);

  const tablesAlreadyExist = tableCheck[0]?.exists === true;

  if (!tablesAlreadyExist) {
    console.log(
      "Fresh database detected — skipping baseline stamp; migrate will create all tables.",
    );
    process.exit(0);
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const { rows: existing } = await client.query<{ id: number }>(
    `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
    [BASELINE_HASH],
  );

  if (existing.length > 0) {
    console.log("Baseline migration already stamped — nothing to do.");
  } else {
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [BASELINE_HASH, Date.now()],
    );
    console.log(
      "Existing database detected — baseline migration stamped as applied.",
    );
  }
} finally {
  await client.end();
}
