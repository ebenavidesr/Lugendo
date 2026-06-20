---
name: Post-merge codegen requirement
description: After any task merge that touches DB schema or OpenAPI spec, typecheck:libs + codegen must be run manually before deploying.
---

## Rule
After every task merge (or batch of merges) that touches:
- `lib/db/src/schema/` (new columns, new tables)
- `lib/api-spec/openapi.yaml` (new fields, new endpoints, schema changes)

Run these two commands **in order** before deploying or restarting services:

```
pnpm run typecheck:libs
pnpm --filter @workspace/api-spec run codegen
```

Then verify both artifacts compile clean:
```
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/lugendo-app run typecheck
```

**Why:** `post-merge.sh` only runs DB migrations (`stamp-baseline` + `migrate`). It does NOT rebuild lib declarations or regenerate the API client. When new columns or OpenAPI fields are added, the TypeScript types in `@workspace/db` and `@workspace/api-client-react` are stale. The server and frontend compile against the old types — the server crashes at runtime with property-not-found errors, and the frontend shows "viaje no encontrado" or similar 500 failures because API queries fail.

**How to apply:** Any time the automatic_updates block mentions a merged task that changed schema or openapi.yaml, run the two commands above before suggesting deploy. This is the first thing to do when the user reports a runtime error after a deploy.

## Port collision recovery
If workflows fail with EADDRINUSE after restart:
```
fuser -k 8080/tcp 2>/dev/null; fuser -k 18147/tcp 2>/dev/null; sleep 2
```
Then restart workflows normally.
