# Architecture

## System Overview

SERP Lists is a React single-page app backed by Cloudflare Pages Functions. D1 is the transactional source of truth for auth, templates, runs, teams, entitlements, and audit history. R2 stores uploaded files.

## High-Level Components

- Frontend: React + Vite app in `src/`.
- API: Cloudflare Pages Functions router in `functions/api/[[route]].ts`.
- Database: Cloudflare D1 through the `DB` binding, queried with Drizzle in `functions/api/db.ts`.
- Object storage: Cloudflare R2 bucket bound as `R2_UPLOADS`.
- Auth: Better Auth mounted under `/api/auth/*` with D1-backed users, accounts, sessions, and verification records.
- Client state: TanStack React Query plus app contexts for auth, workspaces, templates, and runs.

## Request Flow

1. UI calls `src/lib/api.ts`.
2. `functions/api/[[route]].ts` applies CORS/rate-limit handling and routes to handler modules.
3. Handlers validate input, authorize the current session, and read or write D1/R2.
4. Responses use shared JSON helpers from `functions/api/utils/response.ts`.
5. Authenticated browser requests rely on Better Auth httpOnly cookies. The client does not store auth tokens.

## Workspace Model

Every signed-in user has a personal workspace. Users can also belong to team workspaces.

- Personal templates/runs are scoped to the user.
- Team templates/runs are scoped to `team_id`.
- `src/contexts/WorkspaceContext.tsx` owns the active workspace, role capabilities, and workspace switching.
- The active workspace id is persisted in local storage under `serplists.activeWorkspaceId`.
- Team entitlements apply only in the selected team workspace. Personal limits remain personal unless the user's own account is upgraded.

Role capabilities:

- `owner` and `admin`: manage team, members, invites, and team settings.
- `editor`: edit templates and start runs.
- `runner`: start and execute runs.
- `viewer`: read-only access.

## Routes

Canonical private routes use `/dashboard/*`:

- `/dashboard/templates`
- `/dashboard/templates/new`
- `/dashboard/templates/:id`
- `/dashboard/templates/:id/edit`
- `/dashboard/import-templates`
- `/dashboard/runs`
- `/dashboard/runs/:id`
- `/dashboard/settings`

Public routes include:

- `/templates`
- `/categories`
- `/profile/:username`
- `/profile/:username/:templateSlug`
- `/share/:shareToken`
- `/team-invites/:token`

## Data Model

Source of truth:

- Schema history: `db/migrations/*.sql`
- Runtime Drizzle schema: `db/schema/*.ts`
- Applied migration ledger: D1 `d1_migrations`
- Snapshot reference only: `db/schema.sql`

Core D1 tables:

- `users`: auth identity, profile fields, and timestamps.
- `account`, `session`, `verification`: Better Auth persistence.
- `templates`: template metadata, content JSON, public/private state, ownership, team scope, soft-delete state, and attribution.
- `checklist_runs`: run state, progress, share token fields, team scope, soft-delete state, and attribution.
- `template_likes`: user/template favorites.
- `usage_analytics`: event log for template/run actions.
- `stripe_customers`, `stripe_subscriptions`, `stripe_webhook_events`: billing state and webhook idempotency.
- `entitlement_overrides`: user-level manual entitlement overrides.
- `teams`: team identity, slug, creator, billing owner, and archive state.
- `team_members`: team membership, role, status, inviter, and join timestamps.
- `team_invites`: invite records with hashed tokens, requested role, expiration, acceptance, and revocation.
- `team_entitlement_overrides`: team-level plan overrides.
- `audit_events`: append-only actor/resource/action history.
- `template_versions`: template snapshot history.

JSON fields:

- `templates.items` stores sectioned template content. The API normalizes legacy flat items into a single section.
- `templates.category` stores a JSON array of category strings.
- `templates.tags` stores a JSON array of tag strings.
- `templates.rules` stores template rule metadata.
- `checklist_runs.items` stores sectioned run content plus completion state.
- `audit_events.before_json`, `after_json`, `diff_json`, and `metadata_json` store structured audit payloads.
- `template_versions.snapshot_json` stores a point-in-time template snapshot.

## Authorization And Entitlements

- Better Auth session lookup is the only supported login state for normal user flows.
- API handlers enforce authorization; UI gating is secondary.
- User entitlements come from user overrides, dev test personas, Stripe subscriptions, or Free fallback.
- Team entitlements come from `team_entitlement_overrides`.
- Free limits are currently 1 template and 3 active runs. Paid user/team contexts have unlimited templates and active runs.

## Audit And History

Production history is DB-backed:

- Team create/update/invite/member/owner actions write `audit_events`.
- Template changes write `template_versions` and `audit_events`.
- Audit events include actor id, subject, resource, action, optional before/after/diff JSON, request id, hashed IP, user agent, and timestamp.

Do not use git history for user-generated template or team history. Git only tracks code and migration history.

## File Uploads

- `POST /api/uploads` writes to R2 with a per-user key prefix.
- `GET /api/uploads/file?key=...` and `HEAD /api/uploads/file?key=...` serve objects with long-lived cache headers.
- `DELETE /api/uploads/file?key=...` is restricted to the current user prefix.

## Public And Private Data

- `GET /api/templates` returns public templates plus the authenticated user's personal templates, or team templates when `teamId` is supplied and authorized.
- Public template detail routes are available through `/profile/:username/:templateSlug`.
- Public profiles are available through `/api/profiles/by-username` and `/api/profiles/by-id`.
- Shared run links use `/share/:shareToken` and do not expose template editing.

## Deployment Environments

- Local D1: Miniflare state under `.wrangler/`.
- Staging/preview D1: `serp-checklists-staging-db` through `preview_database_id` and Wrangler's `--preview` flag.
- Production D1: `serp-checklists-db`.

Preview deployments must not point at production D1. See [Database environments](../operations/database-environments.md).
