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
- Drizzle's node-postgres `migrate()` runs ALL pending migration files (everything newer than the single latest tracked `created_at`) inside ONE combined transaction, not one transaction per file. If that transaction is killed mid-flight by a deploy timeout, a database can end up with DDL effects from several migrations committed (if the kill happens right at COMMIT) while `__drizzle_migrations` tracking lags behind by multiple files at once — not just the one that hung. Always verify actual table/column/FK state in the target DB (not just the tracking table row count) before writing sentinels; add one sentinel per affected migration file, not just the first.
- Added a `lock_timeout` (via `options: "-c lock_timeout=..."` on the pg `Pool`) so a future lock-contention hang fails fast and loudly instead of silently consuming the entire deploy healthcheck window indistinguishably from a healthy slow migration.
- `connectionTimeoutMillis` and `lock_timeout` don't cover every hang mode (e.g. a stalled DNS/TLS handshake reaching the DB from a fresh deploy container) — confirmed by a real production incident where `migrate()` had nothing pending to run (tracking table already had the latest migration stamped) yet the process still hung silently for the full healthcheck window with zero error logged. Fix: wrap the whole `runMigrations()` call in an explicit overall deadline (`Promise.race` against a `setTimeout`) so ANY unanticipated hang inside it throws a loud, distinct error instead of relying on the platform's healthcheck timeout to kill the container silently.
