---
name: Testing checklist preference
description: User wants all completed tasks added as checkboxes to TESTING.md automatically, in every project.
---

## Rule

After completing or merging any task or feature, add its validation checkboxes to `TESTING.md` at the project root.

**Why:** The user reviews and tests features manually. They want a single file to track what has been shipped and what still needs validation.

## How to apply

- If `TESTING.md` does not exist yet, create it with a header and a "Sprint actual" section.
- Add a new `###` subsection per task/feature with bullet checkboxes (`- [ ]`).
- Cover the happy path, edge cases, and role restrictions that are relevant.
- Never delete already-checked items (`- [x]`).
- Applies to every project, not just Lugendo.
