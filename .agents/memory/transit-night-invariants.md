---
name: Transit night invariants
description: Rules to preserve when touching the isTransitNight flag or wizard per-day state.
---

Rule 1: `isTransitNight` and hotel assignments are mutually exclusive on a day. Any code path that sets the flag to true on an already-persisted day must also delete that day's existing hotel assignment rows (mirror the detail-panel behavior), not just clear local UI state.
**Why:** A wizard once PATCHed the flag on existing itinerary days without removing persisted hotels, producing transit days with hidden hotel rows the UI never surfaced.
**How to apply:** When adding transit toggles to any new flow (wizards, bulk editors, imports), check whether the target day already exists server-side; if so, remove its hotel assignments before/with the flag update.

Rule 2: Wizard state keyed by dayNumber (hotels, activities, transit toggles) must be reset whenever the selected base itinerary/template changes.
**Why:** Stale per-day maps from itinerary A were silently applied to itinerary B's days by dayNumber, mutating a shared template.
**How to apply:** In any selector that swaps the base entity feeding per-day wizard state, clear all Record<number, ...> maps when the selection id changes.
