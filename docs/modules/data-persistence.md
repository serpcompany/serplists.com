# Data Persistence Module

The persistence layer uses Cloudflare D1 (SQLite) for data, Cloudflare Pages Functions for the API, and TanStack React Query for client-side caching.

## Related files
- `functions/api/[[route]].ts` - API router
- `functions/api/db.ts` - Drizzle D1 client
- `functions/api/handlers/` - Auth, templates, checklists, uploads
- `functions/api/utils/jwt.ts` - JWT verification
- `db/schema/` - Drizzle schema (entry: `db/schema/index.ts`)
- `db/types/` - Drizzle model types
- `db/migrations/*.sql` - D1 schema changes
- `src/lib/api.ts` - Client API wrapper
- `src/contexts/TemplatesContext.tsx` - Templates and runs (React Query)
- `src/lib/utils/templateBackup.ts` - Import/export helpers

## Storage model (D1)
Source of truth: `db/migrations/*.sql`. Drizzle schema in `db/schema/index.ts` mirrors the SQL for runtime queries.

### Core tables
- `users` (auth + profile data)
- `templates` (template metadata + JSON `items`)
- `checklist_runs` (run state + JSON `items`)
- `template_likes`
- `usage_analytics`

### JSON columns
- `templates.items` stores the full sections structure.
- `templates.category` stores a JSON array of categories.
- `templates.tags` stores a JSON array of tags.
- `checklist_runs.items` stores sections with completion state.

## API access
Client requests go through `src/lib/api.ts`, which:
- Uses Better Auth session cookies (httpOnly); client requests include cookies (dev uses `credentials: "include"`)
- Uses `http://localhost:8788/api` in dev and `/api` in production

Server handlers:
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `functions/api/handlers/uploads.ts`

## Client caching
`src/contexts/TemplatesContext.tsx` uses TanStack React Query with a 5-minute stale time. Mutations invalidate queries to keep data fresh.

## Import/export
Template backup is implemented in `src/components/TemplateBackup.tsx` using helpers in `src/lib/utils/templateBackup.ts`.
