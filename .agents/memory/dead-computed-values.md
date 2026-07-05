---
name: Computed-but-unrendered values
description: A variable can be computed correctly yet never appear in the UI if no JSX consumes it — verify rendering, not just computation.
---

Found a case where a per-day "Nth noche" (consecutive-nights-at-same-hotel) label was correctly computed by a helper function and assigned to a local variable, but no JSX in the component ever rendered that variable — so the feature silently didn't exist in the UI despite passing typecheck and having correct logic.

**Why:** typecheck and logic review don't catch "computed but never displayed" bugs; only visually inspecting/exercising the actual rendered output does.

**How to apply:** when implementing or fixing a value meant to be user-visible (labels, badges, counters), grep for where the variable is actually interpolated into JSX, not just where it's computed. When several pages/components display overlapping data (e.g. admin trip detail vs traveler passport vs itinerary detail each having their own day-row markup instead of a single shared component), the same badge/label logic must be added to each render site individually — search all of them, don't assume one shared component covers every view.

Related gotcha: when a new day-level column is added to a shared "day" table, grep for every itinerary→trip day-copy code path and add the field to each insert/values mapping explicitly. Multiple independent copy implementations tend to hand-list which fields to carry over, so a new column silently gets dropped in some of them unless you check each one.
