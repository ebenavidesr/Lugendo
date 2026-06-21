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
- The `ensureProductionColumns()` helper in `lib/db/src/index.ts` was a one-time compatibility shim that ran ALTER TABLE on every startup. It was removed from `runMigrations()` in June 2026. Do not re-introduce it.
- All schema changes must go through versioned Drizzle migration files (`lib/db/migrations/`), applied via the `migrate()` call which uses proper advisory locking and only runs each file once.
- If a one-time column backfill is truly needed for production, run it as a separate migration SQL file, not inline startup code.
