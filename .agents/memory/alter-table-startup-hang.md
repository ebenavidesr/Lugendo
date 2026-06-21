---
name: ALTER TABLE hangs production startup
description: Running ALTER TABLE inside the startup migration path hangs production deployments due to PostgreSQL ACCESS EXCLUSIVE lock contention.
---

## Rule
Never run DDL statements (ALTER TABLE, CREATE INDEX, etc.) inside `runMigrations()` or any function called during server startup on the critical path to `app.listen()`.

## Why
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` acquires an `ACCESS EXCLUSIVE` lock in PostgreSQL. In production, the platform keeps idle connections open to the DB (health checks, connection poolers, etc.). Those connections block the lock acquisition indefinitely — there is no statement timeout on `pool.query()` by default. The server never reaches `app.listen()`, the healthcheck fails for the full 60-second deployment timeout, and the deployment is killed.

Symptom in deployment logs: `Running database migrations` fires, then 60 seconds of silence, then SIGTERM.

## How to apply
- `ensureProductionColumns()` was a one-time shim that ran ALTER TABLE on every startup — removed in June 2026. Do not re-introduce it.
- The same ALTER TABLE statements also live in `0001_add_post_baseline_columns.sql`. That migration hangs in production for the same reason, because the columns were already applied by the shim in earlier deployments but the migration was never tracked in `drizzle.__drizzle_migrations`.
- Fix pattern: `stampAlreadyAppliedMigrationsIfNeeded()` in `lib/db/src/index.ts` — for each migration file (after the baseline) that used idempotent DDL, check a sentinel column/table with a cheap SELECT EXISTS, and if the effect is already present, insert the migration hash into `drizzle.__drizzle_migrations` before calling `migrate()`. Sentinel queries are never DDL so they can't block.
- When adding future migration files whose DDL might already be present in production (idempotent via IF NOT EXISTS), add a sentinel entry to the `sentinels` map in `stampAlreadyAppliedMigrationsIfNeeded`. Index is 0-based position in the sorted `.sql` file list.
- All schema changes must go through versioned Drizzle migration files, applied via `migrate()`. Never run DDL ad-hoc at startup.
