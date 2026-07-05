---
name: React Hook Form reactive `values` resets form on every render
description: Using useForm's `values` option with an inline object literal wipes in-progress user edits on any parent re-render (e.g. background query refetch), not just on real data changes.
---

React Hook Form's `useForm({ values })` option reactively calls `reset()` whenever the `values` reference changes. If `values` is an inline object literal (`values: { foo: x.foo, ... }`) instead of a memoized/stable reference, it is a **new reference on every render** of the component — so the form resets on every re-render, including ones caused by unrelated parent re-renders (e.g. a TanStack Query background refetch bumping a sibling's state), silently discarding whatever the user was typing.

**Why:** Found in Lugendo's itinerary day edit dialog (`itinerary-detail.tsx`) — edits to city/country/transport were silently lost because a background refetch of the days list re-rendered the dialog and reset the form via `values`.

**How to apply:** Prefer `defaultValues` + resetting manually (e.g. in a `useEffect` keyed on an id, or only at mount for dialogs that fully unmount/remount per entity) instead of a reactive `values` object built from an inline literal. If `values` is genuinely needed, memoize it so its reference is stable across renders when the underlying data hasn't changed. Grep for `values: {` in `useForm(...)` calls to find other instances of this pattern before assuming a "changes don't save" bug is elsewhere.
