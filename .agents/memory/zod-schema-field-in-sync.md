---
name: Zod validation schema drift vs shared type
description: A field added to a shared TS interface / OpenAPI schema can still be silently dropped on save if the server-side Zod validation object (schemas.ts) isn't updated too.
---

When adding a new field to a nested/embedded type (e.g. a field inside a `jsonb` array item like `FlightLeg`), it must be added in ALL of these places, not just the Drizzle schema + OpenAPI:

1. Drizzle TS interface (`lib/db/src/schema/*.ts`)
2. OpenAPI component schema (`lib/api-spec/openapi.yaml`) + codegen
3. Frontend form/type usage
4. **Server-side Zod validation object** in `artifacts/api-server/src/lib/schemas.ts` (e.g. `FlightLegSchema`)

**Why:** Zod's `z.object({...})` strips unknown keys by default (no error, no warning). If step 4 is missed, the new field round-trips fine in the UI state but gets silently deleted by the `validate(Schema)` middleware before it ever reaches the DB — the save appears to succeed but the field is empty on reload. This is very easy to miss because typecheck passes and no error is thrown anywhere.

**How to apply:** After adding a field to any type validated by a hand-written Zod object (not auto-generated from OpenAPI), grep `schemas.ts` for the sibling fields of that type and add the new one there too. Confirm with an e2e round-trip test (save then reopen/reread), not just a typecheck.
