---
name: Traveler-facing aggregates must avoid permission-scoped endpoints
description: Some /me/trips/:id/* endpoints are restricted to owner/full-permission sharers; computing shared aggregates (e.g. traveler count) from them breaks for other roles.
---

When building a UI that must "work the same for all roles" (owner, read-only
share, full-permission share, agency-invited traveler) on a traveler-facing
trip page, do not source aggregate data from endpoints gated by
`requireRoles`/ownership checks scoped to *managing* that resource — e.g.
`GET /api/me/trips/:id/shares` 403s for users who aren't the trip owner or a
full-permission sharer.

**Why:** A component that calls a restricted endpoint will silently fail
(query error swallowed, `data` undefined) for exactly the traveler roles the
feature is supposed to serve equally, producing wrong or fallback values
instead of an error.

**How to apply:** Prefer fields already present on the main resource payload
(e.g. `TravelerTripDetail.travelerCount`, computed once server-side with the
correct scoping) over calling side endpoints to recompute the same number
client-side. If no such field exists, ask whether the derived aggregate
needs a role-safe backend field before building client-side aggregation.

If the existing server-computed field turns out to be *wrong* for some cases
(e.g. only counts one access path — invitations — and ignores another —
shares — so it undercounts or returns 0), don't paper over it with client-side
fallback heuristics. Fix the computation at its source inside the endpoint
that already gates access correctly; every viewer who can already load that
endpoint gets the corrected value for free, with no new permission surface.
