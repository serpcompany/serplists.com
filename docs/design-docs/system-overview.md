# System Overview

## Summary

SERP Lists is a React single-page app backed by Cloudflare Pages Functions. D1 is the transactional source of truth for auth, Templates, Runs, Organizations, entitlements, and audit history. R2 stores uploaded files.

## High-Level Components

- Frontend: React + Vite app in `src/`.
- API: Cloudflare Pages Functions router in `functions/api/[[route]].ts`.
- Database: Cloudflare D1 through the `DB` binding, queried with Drizzle in `functions/api/db.ts`.
- Object storage: Cloudflare R2 bucket bound as `R2_UPLOADS`.
- Auth: Better Auth mounted under `/api/auth/*` with D1-backed users, accounts, sessions, and verification records.
- Client state: TanStack React Query plus app contexts for auth, ownership context, Templates, and Runs.

## Request Flow

1. UI calls `src/lib/api.ts`.
2. `functions/api/[[route]].ts` applies CORS/rate-limit handling and routes to handler modules.
3. Handlers validate input, authorize the current session, and read or write D1/R2.
4. Responses use shared JSON helpers from `functions/api/utils/response.ts`.
5. Authenticated browser requests rely on Better Auth httpOnly cookies. The client does not store auth tokens.

## Ownership Context Model

Every signed-in User has a Personal context. Users can also belong to Organizations.

- Personal Templates and Runs are scoped to the User.
- Organization Templates and Runs are scoped through the legacy `team_id` implementation column.
- The legacy-named `src/contexts/WorkspaceContext.tsx` owns the active context, Organization Role capabilities, and context switching.
- Remembered context is persisted under the legacy local-storage key `serplists.activeWorkspaceId`; it is convenience state, not authorization.
- Organization entitlements apply only in the selected Organization context. Personal limits remain Personal unless the User's plan is upgraded.

Role capabilities:

- `owner` and `admin`: manage the Organization, members, invites, and settings.
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
- `/dashboard/archive`

Public routes include:

- `/templates`
- `/categories`
- `/profile/:username`
- `/profile/:username/:templateSlug`
- `/share/:shareToken`
- `/team-invites/:token` (legacy compatibility route for Organization invites)

## API Routes

All routes are under `/api`. Organization routes keep the legacy `/api/teams`
identifiers, and Template and Run routes accept the legacy `teamId` parameter where
Organization scoping applies.

- Auth (Better Auth): `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `GET /api/auth/status`
- Public profiles: `GET /api/profiles/by-username`, `GET /api/profiles/by-id`
- Templates: `GET /api/templates`, `GET /api/templates/:id`, `GET /api/templates/slug/:slug`, `GET /api/templates/public?userId=...`, `POST /api/templates`, `PUT|DELETE /api/templates/:id`
- Runs: `GET /api/checklists`, `GET /api/checklists/:id`, `POST /api/checklists`, `PUT|DELETE /api/checklists/:id`, `POST /api/checklists/:id/revalidate`
- Organizations: `GET|POST /api/teams`, `GET|PUT /api/teams/:teamId`, `GET /api/teams/:teamId/members`, `PUT /api/teams/:teamId/members/:memberId`, `PUT /api/teams/:teamId/owner`, invites, and activity (see [organizations](organizations.md))
- Billing: `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status`; Stripe webhook `POST /api/stripe/webhook`
- Uploads: `POST /api/uploads`, `GET|HEAD|DELETE /api/uploads/file?key=...`
- Health: `GET /api/health`

Run responses include `template_version`, `current_template_version`, `revision`,
and derived `is_stale`. Send `expected_revision` when updating a run and
`expected_version` when updating a template; `POST /api/checklists/:id/revalidate`
reconciles and reopens a completed private run. A template update that changes
content (anything but visibility) without `expected_version` gets `409 edit_conflict`,
and `PUT /api/templates/:id` returns the new `version` and `content_version`, and the
`slug` the template has after the save (the requested one, suffixed if it was taken,
or the one it kept when none was requested). The
template editor loads the template by id (`GET /api/templates/:id`) when it opens and
sends the version it loaded, then the version each save returns, never the content or
version in the cached template lists.

## Data Model

Source of truth:

- Schema history: `db/migrations/*.sql`
- Runtime Drizzle schema: `db/schema/*.ts`
- Applied migration ledger: D1 `d1_migrations`
- Snapshot reference only: `db/schema.sql`

Core D1 tables:

- `users`: auth identity, profile fields, and timestamps.
- `account`, `session`, `verification`: Better Auth persistence.
- `templates`: Template metadata, content JSON, public/private state, Resource Owner scope, soft-delete state, attribution, and a content-specific version used for Run reconciliation.
- `checklist_runs`: Run state, progress, share token fields, Resource Owner scope, soft-delete state, attribution, reconciled Template version, optimistic-concurrency revision, and retired Run history.
- `template_likes`: user/template favorites.
- `usage_analytics`: event log for template/run actions.
- `stripe_customers`, `stripe_subscriptions`, `stripe_webhook_events`: billing state and webhook idempotency.
- `entitlement_overrides`: user-level manual entitlement overrides.
- `teams`: legacy implementation table for Organization identity, slug, creator, billing owner, and archive state.
- `team_members`: legacy implementation table for Organization Membership, role, status, inviter, and join timestamps.
- `team_invites`: legacy implementation table for Organization invite records.
- `team_entitlement_overrides`: legacy implementation table for Organization-level plan overrides.
- `audit_events`: append-only actor/resource/action history.
- `template_versions`: template snapshot history.

JSON fields:

- `templates.items` stores sectioned template content. The API normalizes legacy flat items into a single section.
- `templates.category` stores a JSON array of category strings.
- `templates.tags` stores a JSON array of tag strings.
- `templates.rules` stores template rule metadata.
- `checklist_runs.items` stores the current sectioned run content plus completion state. `retired_items` stores removed sections/items/sub-items for history without counting them toward readiness.
- Template changes reconcile only active private runs by stable section/item/sub-item ID. Completed, archived, and shared runs keep their snapshot and become stale when their `template_version` trails the source template.
- `audit_events.before_json`, `after_json`, `diff_json`, and `metadata_json` store structured audit payloads.
- `template_versions.snapshot_json` stores a point-in-time template snapshot.

## Authorization And Entitlements

- Better Auth session lookup is the only supported login state for normal user flows.
- API handlers enforce authorization; UI gating is secondary.
- User entitlements come from user overrides, dev test personas, Stripe subscriptions, or Free fallback.
- Organization entitlements come from the legacy `team_entitlement_overrides` table.
- Free limits are currently 1 Template and 3 active Runs. Paid Personal and Organization contexts have unlimited Templates and active Runs.

## Audit And History

Production history is DB-backed:

- Organization create/update/invite/member/owner actions write `audit_events`.
- Template changes write `template_versions` and `audit_events`.
- Audit events include actor id, subject, resource, action, optional before/after/diff JSON, request id, hashed IP, user agent, and timestamp.

Do not use git history for user-generated Template or Organization history. Git only tracks code and migration history.

## File Uploads

- `POST /api/uploads` writes to R2 with a per-user key prefix.
- `GET /api/uploads/file?key=...` and `HEAD /api/uploads/file?key=...` serve objects with long-lived cache headers.
- `DELETE /api/uploads/file?key=...` deletes only the current user's avatars. Template uploads (`template-images/`, `template-videos/`, `template-files/`) are refused with 409 because templates, runs, versions, and copies share them; see [database operations](database-operations.md#r2-uploads).

## Public And Private Data

- `GET /api/templates?scope=public` returns the public catalog, identical for every visitor and edge-cached for 5 minutes. `?scope=personal` returns the signed-in User's Personal Templates, and `?teamId=...` the authorized Organization's. With no parameter it returns public Templates plus the User's Personal Templates, for clients loaded before scopes existed (TD-15).
- Public template detail routes are available through `/profile/:username/:templateSlug`.
- Public profiles are available through `/api/profiles/by-username` and `/api/profiles/by-id`.
- Shared run links use `/share/:shareToken` and do not expose template editing.

## Deployment Environments

- Local D1: Miniflare state under `.wrangler/`.
- Staging/preview D1: `serp-checklists-staging-db` through `preview_database_id`, `[[env.preview.d1_databases]]`, and Wrangler's `--preview` flag.
- Production D1: `serp-checklists-db`.

Preview deployments must not point at production D1. See [database operations](database-operations.md).
