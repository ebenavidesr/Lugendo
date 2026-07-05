---
name: Notion roadmap sync
description: How to create/update Notion "Product Roadmap" pages from BACKLOG.md/TESTING.md, and when to do it automatically.
---

Sync target: Notion database **"Product Roadmap"** (id `39431a55-67cc-8079-86b2-ea64829509e2`), reached via `listConnections('notion')` in the `code_execution` sandbox (use `settings.access_token` with raw `fetch` to `https://api.notion.com`, header `Notion-Version: 2022-06-28` — the `@replit/connectors-sdk` package is NOT importable from the sandbox root, only from within workspace packages that declare it as a dependency).

**When to sync (do this proactively, without asking):**
- A new task is added to `BACKLOG.md` "En cola" → create a Notion page, Status = `Planned`.
- A task moves from "En cola" to "Completadas" → create/update its Notion page, Status = `In progress` (this is the deliberate mapping the user chose, even though it reads oddly), and append the TESTING.md checklist for that task number to the page body if one exists.
- A task moves to "Descartadas" → create/update its Notion page, Status = `Cancelled`.
- If a page for that task number already exists (check by querying/searching "Project name" starts with `#N `), update it instead of creating a duplicate.

**Property mapping** (`POST /v1/pages` with `parent: { database_id }`):
| Notion property | Type | Source |
|---|---|---|
| `Project name` | title | `"#N <tarea>"` (task number + space + task text) |
| `Prioridad` | select | BACKLOG.md priority stripped of emoji (`Alta`/`Media`/`Baja`) — only present for "En cola" rows |
| `Área` | select | BACKLOG.md Área column as-is (keep `·` separators, it's a single select value not multi-select) |
| `Sugerido Por` | select | BACKLOG.md Autor column as-is (`Tú` / `Yo`) — only present for "En cola" rows |
| `Status` | select | mapping above; valid options already in the DB: `Planned`, `Backlog`, `Completed`, `Cancelled`, `In progress` |

Completadas/Descartadas rows in BACKLOG.md have no Prioridad/Autor columns — omit those properties for those pages (don't guess a value).

**Page body (children blocks)**, not a property:
- `heading_3` "Plan" + `paragraph` with the task's one-line description as the plan text.
- If completed and TESTING.md has a `### #N — ...` section for that task number: `heading_3` "Checklist de validación (TESTING.md)" + one `to_do` block per checklist line, with `checked` matching the `[x]`/`[ ]` state in TESTING.md.

**Rate limiting:** Notion allows ~3 req/sec average; sleep ~350ms between page creates when doing a bulk sync.
