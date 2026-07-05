---
name: Mutation must invalidate query cache on every success path
description: A checkbox/toggle mutation succeeded server-side (200) but the UI silently failed to reflect it, because its onSuccess didn't call invalidate() — even though a sibling mutation (delete) in the same component did.
---

When a component has several mutations against the same resource (toggle, delete, edit), every one of them needs its own `onSuccess: () => invalidate()` (or equivalent query invalidation) — it's easy to add it to one handler (e.g. delete) and forget it on another (e.g. toggle), since compile-time checks won't catch a missing cache invalidation.

**Why:** Discovered during Lugendo trip-checklist feature — toggling item completion returned HTTP 200 from the server (confirmed via curl) but the progress bar and item state never updated in the UI, because `handleToggleItem`'s mutation lacked the `invalidate()` call that `handleDeleteItem` had.

**How to apply:** When reviewing/writing multiple mutate() calls in the same component, check that every state-changing mutation (create/update/toggle/delete) invalidates the relevant query in `onSuccess`, not just some of them. A backend curl check returning 200 does NOT prove the frontend is wired correctly — always verify via an actual UI re-render/e2e check, not just the network response.

## Related: scope shared/child resources by the resource's owner, not the caller's session

When a traveler-facing endpoint needs a resource's parent (e.g. "this trip's agency"), derive it by querying the parent row (`trips.agency_id` for the given `tripId`), not from `req.session.agencyId`. Session agency is the *caller's own* agency (often null for travelers, or wrong when a traveler is invited/shared into a trip owned by a different agency). This pattern applies broadly: always resolve tenant/owner scoping from the record being acted on, not from the actor's session, whenever the actor can interact with records they don't own (invites, shares).

Also: every traveler route that reads/writes a trip's child resource (checklist, notes, documents) must independently verify the traveler has access to that trip (owner OR accepted invite OR accepted share) before touching data — don't assume a route is safe just because it filters by `userId`, since that only protects *within* the resource, not cross-trip access. And when items belong to both a parent and are addressed by their own id (e.g. `/trips/:tripId/checklist/items/:itemId`), scope UPDATE/DELETE WHERE clauses by both ids together, not just the item id + owner, to keep the URL's resource hierarchy meaningful.
