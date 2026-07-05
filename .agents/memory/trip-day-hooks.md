---
name: Trip day admin vs traveler mutation hooks
description: Which generated hook to use when mutating a trip day from back-office vs traveler code paths.
---

This codebase has separate generated mutation hooks for trip-day updates depending on caller role: one scoped to the traveler-only "personal trip" route, and a distinct one for the admin/manager/agent back-office route.

**Why:** picking the traveler-scoped hook from a back-office component silently targets the wrong endpoint/permission scope and fails typecheck (payload shape mismatch) or authorization at runtime.

**How to apply:** before wiring a trip-day mutation, check whether the hook name/generated client corresponds to the traveler personal-trip route or the staff/back-office route — don't assume by name alone. Use the codegen'd hooks list (`lib/api-client-react/src/generated`) as the source of truth, since exact hook names can change with the OpenAPI spec.
