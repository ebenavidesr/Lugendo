---
name: API server startup ordering
description: Why the API server opens the port before running migrations, and the liveness/readiness split that goes with it.
---

The API server binds the port FIRST (`app.listen` at module top level), then runs DB migrations INSIDE the listen callback. On migration success it flips the readiness flag; on migration failure it exits non-zero.

**Why:** Binding late — only after migrations finished — caused deploy health-checks to time out (~60s) whenever migrations took a while, because the port never opened in time. Opening the port immediately makes the platform see the service as up right away.

**How to apply:**
- `/api/healthz` is pure **liveness**: always returns 200 the moment the process is listening, with `{ok, ready, version}`. Never gate it on readiness again, or you reintroduce the timeout.
- Real API traffic is gated by a **readiness** middleware (mounted after the health router in the route composition) that returns 503 until migrations complete. This exists because the port now opens before the schema is migrated, so requests could otherwise hit a stale schema.
- Keep `server.on("error")` → `process.exit(1)` so a bind failure (EADDRINUSE) restarts rather than hangs.

**Known gap:** a migration that *hangs* (rather than fails) leaves the deploy marked healthy (liveness stays 200) while every real request gets 503 forever. Failed migrations are covered (exit 1 → restart); a hang is not. If this ever bites, add a watchdog timeout around `runMigrations` that exits non-zero.
