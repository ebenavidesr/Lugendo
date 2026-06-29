---
name: Testing checklist and task suggestion preferences
description: User wants all completed tasks added as checkboxes to TESTING.md automatically, and follow-up task suggestions to only offer queue/dismiss options.
---

## Rule

After completing or merging any task or feature, add its validation checkboxes to `TESTING.md` at the project root.

**Why:** The user reviews and tests features manually. They want a single file to track what has been shipped and what still needs validation.

## How to apply — TESTING.md

- If `TESTING.md` does not exist yet, create it with a header and a "Sprint actual" section.
- Add a new `###` subsection per task/feature with bullet checkboxes (`- [ ]`).
- Cover the happy path, edge cases, and role restrictions that are relevant.
- Never delete already-checked items (`- [x]`).
- Applies to every project, not just Lugendo.

## How to apply — follow-up task suggestions

When proposing follow-up tasks at the end of a session, never offer a "start now" option. Present each suggestion with only two actions:
- **Añadir a tareas** — queues it via `project_tasks` for the user to start when they decide.
- **Eliminar** — dismisses it without queuing.

**Why:** The user wants full control over when work starts. Auto-starting is disruptive to their workflow.
