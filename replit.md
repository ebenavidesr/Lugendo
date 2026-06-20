# Lugendo

B2B2C travel platform — back office for travel agencies (admin/manager/agent roles) and a traveler-facing passport view.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm --filter @workspace/lugendo-app run dev` — run the React frontend (port 18147, path `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a new versioned migration SQL file after schema changes
- `pnpm --filter @workspace/db run migrate` — apply all pending migrations (safe; never drops data)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

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
- `customFetch` configured with `credentials: 'include'` for cookie-based auth through Replit proxy
- TanStack Query configured with no-retry on 401/403 to prevent blank-screen loading loops

## Product

- **Back Office**: Agency admins manage hotels, itineraries, trips, team members. Dashboard with summary stats.
- **Traveler Portal ("Passport")**: Travelers view their assigned trips and day-by-day itineraries.
- Phase 0 MVP: full login/register flow, role-based routing, stub dashboard and traveler home.

## User preferences

- Brand: DM Sans (body), DM Serif Display (headings/serif). Colors: Arena #FAF2EB bg, Duna #ECD5B8 cards, Terracota #C4793A CTA, Ocre #8B4420 hover, Índigo #3D2F6B accent, Noche #2D1F0E sidebar/text.
- Use the brand CSS variables (`--terra`, `--indigo`, `--noche`, etc.) directly in components rather than hardcoding hex values.
- Any feature or change must work for **all user roles** (admin, manager, agent, traveler) unless explicitly stated otherwise. Both API permissions and frontend UI should be role-inclusive by default.

## DB Migration Workflow

The project uses **versioned migrations** (not `push`). Every schema change must go through:

1. Edit the Drizzle schema file in `lib/db/src/schema/`.
2. Run `pnpm --filter @workspace/db run generate` — produces an auditable SQL file in `lib/db/migrations/`.
3. Run `pnpm --filter @workspace/db run migrate` — applies only the new SQL files; never drops existing data.

**Never run `push-unsafe` or `push-unsafe-force` against a database that has real data.** Those commands diff and apply destructively — they can silently drop or alter columns.

Rules for new columns:
- New `NOT NULL` columns **must** include a `DEFAULT` value, OR be introduced in two phases: nullable first → backfill data → add constraint. This ensures existing rows are never invalidated.
- `post-merge.sh` automatically runs `stamp-baseline` then `migrate` after every task merge; no manual step required in CI.

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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
