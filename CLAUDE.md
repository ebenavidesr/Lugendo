# Lugendo

B2B2C travel platform — back office for travel agencies (admin/manager/agent roles) and a traveler-facing passport view.

## Local development

**The dev database is not reachable from local machines.** `DATABASE_URL` lives inside Replit's managed Postgres (host `helium`) and is only reachable from within the Replit environment — it is not exposed externally. Do not expect `pnpm --filter @workspace/api-server run dev` (or `migrate`/`generate` against the real dev DB) to work from a local checkout as-is. For now, run and test the backend inside Replit, not locally. Frontend-only work (components, styling, client-side logic) that doesn't need a live API can still be developed locally.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm --filter @workspace/lugendo-app run dev` — run the React frontend (port 18147, path `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a new versioned migration SQL file after schema changes
- `pnpm --filter @workspace/db run migrate` — apply all pending migrations (safe; never drops data)
- Required env: `DATABASE_URL`, `SESSION_SECRET` (see [Local development](#local-development) above)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, express-session + connect-pg-simple, bcrypt
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Frontend: React 19, Vite, Wouter (routing), TanStack Query, shadcn/ui
- Build: esbuild (CJS bundle for API)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/api-client-react/src/generated/` — generated React Query hooks + Zod schemas
- `lib/db/src/schema/` — Drizzle schema (agencies, users, hotels, itineraries, trips, invitations)
- `artifacts/api-server/src/routes/` — all API route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — requireAuth, requireRoles
- `artifacts/lugendo-app/src/` — React frontend
- `artifacts/lugendo-app/src/index.css` — Lugendo brand design tokens (Arena/Duna/Terracota/Índigo/Noche palette)

## Architecture decisions

- Contract-first: OpenAPI → Orval codegen → typed hooks + Zod schemas used on both client and server
- Session auth (not JWT): express-session with connect-pg-simple storage; `sessions` table pre-created in DB
- Roles enforced via middleware: `requireRoles('admin','manager')` on protected routes
- Input validation: every POST/PUT/PATCH route uses `validate(Schema)` from `artifacts/api-server/src/middlewares/validate.ts`; invalid bodies return HTTP 400 with `{ error, errors: fieldErrors }`. All Zod schemas live in `artifacts/api-server/src/lib/schemas.ts`.
- `customFetch` configured with `credentials: 'include'` for cookie-based auth through Replit's proxy (still relevant while dev runs inside Replit)
- TanStack Query configured with no-retry on 401/403 to prevent blank-screen loading loops

## Product

- **Back Office**: Agency admins manage hotels, itineraries, trips, team members. Dashboard with summary stats.
- **Traveler Portal ("Passport")**: Travelers view their assigned trips and day-by-day itineraries.
- Phase 0 MVP: full login/register flow, role-based routing, stub dashboard and traveler home.

## Working conventions

- Brand: DM Sans (body), DM Serif Display (headings/serif). Colors: Arena #FAF2EB bg, Duna #ECD5B8 cards, Terracota #C4793A CTA, Ocre #8B4420 hover, Índigo #3D2F6B accent, Noche #2D1F0E sidebar/text.
- Use the brand CSS variables (`--terra`, `--indigo`, `--noche`, etc.) directly in components rather than hardcoding hex values.
- Any feature or change must work for **all user roles** (admin, manager, agent, traveler) unless explicitly stated otherwise. Both API permissions and frontend UI should be role-inclusive by default.
- Whenever a task or feature is completed, add its validation checkboxes to `TESTING.md` at the root of the project. Keep already-checked items intact.
- When suggesting follow-up tasks, don't offer to start them immediately. Offer only two choices: queue it in `BACKLOG.md`, or drop it. The user decides when to execute queued tasks.
- Maintain `BACKLOG.md` at the project root with a table of all tasks (columns: #, Tarea, Prioridad 🔴/🟡/🟢, Área, Autor), with sections "En cola", "Completadas", "Descartadas". Update it whenever tasks are created, merged, or cancelled.
- At the start of a session, surface (1) completed tasks still pending review — items in `TESTING.md` with unchecked validation boxes — and (2) pending tasks from `BACKLOG.md`'s "En cola" section with priority and área.
- Keep the "Product Roadmap" Notion database in sync: whenever a task is added to `BACKLOG.md` ("En cola"), moved to "Completadas", or moved to "Descartadas", create/update its Notion page in the same action. See `.agents/memory/notion-roadmap-sync.md` for the field mapping and page-content format.

## Gestión de tareas (Notion)

El proyecto usa un board Notion tipo kanban con los buckets: Backlog, Planned, In Progress, QA, Completed, History, y Cancelled (lateral).

Roles y responsabilidades:

- **Backlog**: las tarjetas las crea Claude (chat, en claude.ai) — no yo. Cada tarjeta incluye número de tarea, título, descripción breve y el prompt de ejecución.
- **Backlog → Planned**: Quique decide cuándo, indicando "planifica la tarea #XX". En ese momento, yo defino subtareas y el definition of done, y dejo la tarjeta en Planned.
- **Planned → In Progress**: Quique decide cuándo ejecutar. Al empezar, muevo la tarjeta a In Progress y creo un checklist de QA con todo lo que hay que revisar para confirmar que los cambios funcionan.
- **Cambios de alcance durante In Progress**: si descubro que la tarea requiere un enfoque distinto al planificado, actualizo la misma tarjeta (subtareas y/o definition of done) sin moverla de bucket ni crear una nueva. Si el cambio es sustancial, se lo señalo explícitamente a Quique antes de continuar.
- **In Progress → QA**: Quique la mueve cuando empieza a revisar y validar los cambios manualmente. Yo no toco la tarjeta en este estado.
- **QA → Completed**: Quique la mueve cuando todo está validado. IMPORTANTE: aunque esté en Completed, no debo darla por cerrada ni tocar nada más — se queda pendiente de confirmación final, por si aparece algún error de desarrollo o de planteamiento que Quique detecte más tarde.
- **Completed → History**: solo cuando Quique me avisa explícitamente de que sincronice (esto pasa en lote, no tarjeta a tarjeta). En ese momento, confirmo que puedo marcar la tarea como terminada y la archivo en History.
- **Cancelled**: puedo mover cualquier tarjeta, de cualquier bucket, a Cancelled si detecto que ya no aplica (por ejemplo, un bug que investigo y descubro que ya está resuelto).
- **Bugs**: se gestionan directamente entre Quique y yo, sin pasar por Notion en ningún momento.

## DB Migration Workflow

The project uses **versioned migrations** (not `push`). Every schema change must go through:

1. Edit the Drizzle schema file in `lib/db/src/schema/`.
2. Run `pnpm --filter @workspace/db run generate` — produces an auditable SQL file in `lib/db/migrations/`.
3. Run `pnpm --filter @workspace/db run migrate` — applies only the new SQL files; never drops existing data.

**Never run `push-unsafe` or `push-unsafe-force` against a database that has real data.** Those commands diff and apply destructively — they can silently drop or alter columns.

Rules for new columns:
- New `NOT NULL` columns **must** include a `DEFAULT` value, OR be introduced in two phases: nullable first → backfill data → add constraint. This ensures existing rows are never invalidated.
- `post-merge.sh` automatically runs `stamp-baseline` then `migrate` after every task merge; no manual step required.

### Bootstrap an existing database (one-time, per environment)
If a database was previously managed with `push`, run this once before letting `migrate` take over:
```
pnpm --filter @workspace/db run stamp-baseline
```
`stamp-baseline` detects whether the tables already exist:
- **Existing DB**: stamps the baseline migration as applied in Drizzle's tracking table so `migrate` doesn't try to recreate tables that are already there.
- **Fresh DB**: exits immediately and lets `migrate` create all tables normally.

After the one-time stamp, `migrate` is safe to run on that environment on every deployment.

### Deploying to production
The API server automatically runs pending migrations at startup (before accepting requests). If a migration fails the process exits with a non-zero code so the platform restarts rather than serving a broken app.

For a **first-time** production deployment on a database that was previously managed with `push`, run this once before starting the server:
```
pnpm --filter @workspace/db run stamp-baseline
```
No manual `migrate` step is needed after that — the server handles it on every start.

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `generate` + `migrate` after changing any schema file in `lib/db/src/schema/` — never `push-unsafe`
- The `sessions` table must exist before starting the API server (already created — do not drop it)
- `connect-pg-simple` with `createTableIfMissing: true` is BROKEN when bundled (can't find `table.sql`). The `sessions` table is pre-created manually; keep `createTableIfMissing` omitted.
- Google Fonts `@import url(...)` must be the FIRST line in `index.css` — before any other `@import` or `@plugin` rules.
- Seed admin: `admin@lugendo.io` / `admin1234` (agencyId=1, role=admin)
- `DATABASE_URL` cannot be reached from outside Replit — see [Local development](#local-development).
- Mapa section (Mapbox GL JS, Notion #125): needs the **same public Mapbox token** in two places — `VITE_MAPBOX_TOKEN` in `artifacts/lugendo-app/.env` (frontend map rendering + Directions API route) and `MAPBOX_ACCESS_TOKEN` in `artifacts/api-server/.env` (backend geocoding, `artifacts/api-server/src/lib/geocoding.ts`). Currently using Mapbox's default `light-v11` style; a branded Mapbox Studio style is a planned follow-up — once created, its style URL replaces the hardcoded `mapbox://styles/mapbox/light-v11` in `artifacts/lugendo-app/src/components/trip-map-tab.tsx`.
