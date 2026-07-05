---
name: Production deploy hang after "Boot: modules loaded"
description: Autoscale deploy stalls silently between module-load and DB migration logs, never crashing, never listening, even though the same build + same DB works instantly outside the deployment.
---

Symptom: on Autoscale deploy, the app logs `"Boot: modules loaded, starting up"` then nothing else — no "Running database migrations", no crash, no "Migrations complete" — until the platform SIGTERMs it ~60s later for never opening its port. Health check requests during that window return HTTP 500 (not connection-refused), which points to a *different, already-running* process still bound to the port (a leftover from a prior failed deploy attempt) answering those checks, not the new one.

Ruled out by direct testing (do these first before assuming app-code bug):
- Running the exact same compiled `dist/index.mjs` locally with `NODE_ENV=production` against the *same* production `DATABASE_URL` boots and starts listening in under 300ms — so it is not a code bug, not a DB schema issue, not a DB reachability issue from this workspace's network path.
- `pnpm run build` and `pnpm run typecheck` both pass clean — not a build/compile failure despite the deploy UI saying "build failed to publish".

**Why:** the only plausible remaining explanation is an Autoscale-container-specific stall (e.g. a stuck/leftover process still holding the port from a previous failed deploy, or a network/DNS path that behaves differently inside the Autoscale sandbox than from the dev workspace). This class of bug is not reproducible locally and needs the actual deploy attempt's logs, ideally with granular step-by-step progress logging already in place (see below), to pin down further.

**How to apply:** when a production deploy hangs/500s and the same code+DB works fine locally, don't keep guessing at app-code causes — reproduce locally first (build the prod bundle, run it with prod env vars against the real prod DB) to confirm/deny an app-code cause, then treat it as infra-side (retry the deploy; check for stuck previous instances; consider Autoscale machine size) if local repro succeeds.

Hardening added so the *next* occurrence is diagnosable: `runMigrations()` now takes an `onProgress(step)` callback logging before/after each of its three internal steps (stampBaseline, stampAlreadyApplied, migrate), a `pool.on('error', …)` handler was added (idle-client pg errors previously had no listener → surfaced as untraceable uncaught exceptions), and `app.listen()`'s server now has an explicit `.on('error', …)` handler (EADDRINUSE from a leftover process was previously unhandled). Also added a catch-all Express error-handling middleware since there was none — any thrown/next(err) error was silently swallowed into a bare 500 with zero log line.
