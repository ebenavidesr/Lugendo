---
name: Google Cloud Storage bundling
description: @google-cloud/storage must be bundled into the esbuild output in production; externalizing it causes silent server hang.
---

In `artifacts/api-server/build.mjs`, `@google-cloud/*` was in the `external` list. This works in the Replit dev environment (where pnpm workspace symlinks are set up), but in the production deployment container the module cannot be resolved, causing the Node.js process to hang silently — no pino logs, no stderr, port 8080 never opens.

**Fix:** remove `"@google-cloud/*"` from the `external` array in `build.mjs` so esbuild bundles `@google-cloud/storage` directly into `dist/index.mjs`. Bundle grows from ~4mb to ~5.5mb but starts correctly in production.

**Why:** the production deployment environment resolves external modules differently (no pnpm workspace symlinks), so externalizing causes a silent hang rather than a visible error.

**How to apply:** keep `"@google-cloud/*"` out of the esbuild externals in `build.mjs`. If other `@google-cloud/` packages are added later that load `.proto` files via path traversal, add them back explicitly by full name (e.g. `"@google-cloud/secret-manager"`), not the wildcard.
