# Architecture

## System overview
SERP Checklists is a single-page React app backed by Cloudflare Pages Functions. Data is stored in Cloudflare D1 (SQLite) and file uploads go to Cloudflare R2.

### High-level components
- **Frontend**: React + Vite app in `src/`
- **API**: Cloudflare Pages Functions router in `functions/api/[[route]].ts`
- **Database**: D1 tables managed via `db/migrations/*.sql` and queried with Drizzle (`functions/api/db.ts`)
- **Object storage**: R2 bucket bound as `R2_UPLOADS`

## Request flow
1. UI calls the API through `src/lib/api.ts`.
2. `functions/api/[[route]].ts` routes requests to handler modules.
3. Handlers read/write D1 or R2 and return JSON responses.
4. `ApiClient` stores the JWT in `localStorage` and includes it in `Authorization` headers.

## Data model (D1)
Source of truth: `db/migrations/*.sql`.

### Tables
- **users**: auth identity, name, username, avatar_url, timestamps. Includes affiliate-related columns from historical migrations that are not used in the UI.
- **templates**: title, description, `items` (JSON), `is_public`, `category` (JSON array), `tags` (JSON array), `slug`, timestamps.
- **checklist_runs**: title, `items` (JSON), `status`, `progress`, timestamps, optional template reference.
- **template_likes**: join table for likes/favorites.
- **usage_analytics**: event log for template/run actions (not exposed in UI).

### JSON fields
- `templates.items` stores the full section structure. The API normalizes legacy flat items into a single section.
- `templates.category` stores a JSON array of category strings.
- `templates.tags` stores a JSON array of tags.
- `checklist_runs.items` stores sections (or legacy flat items) plus completion state.

## Authentication
- Email/password auth in `functions/api/handlers/auth.ts` using `bcryptjs`.
- Custom JWT in `functions/api/utils/jwt.ts` with a 30-day expiry.
- Client stores the token in `localStorage` under `auth_token` and attaches `Authorization: Bearer <token>`.

## File uploads
- `POST /api/uploads` writes to R2 with a per-user key prefix.
- `GET/HEAD /api/uploads/file?key=...` serves objects with long-lived cache headers.
- `DELETE /api/uploads/file?key=...` is restricted to the current user prefix.

## Public vs private data
- `GET /api/templates` returns public templates; when authenticated it includes the user's private templates.
- `GET /api/templates/slug/:slug` returns public templates or those owned by the current user.
- Public profiles are available via `/api/profiles/by-username` and `/api/profiles/by-id`.
