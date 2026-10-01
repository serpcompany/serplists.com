# System Overview

## Summary

SERP Lists is a Next.js app on Cloudflare Workers (through OpenNext); the same Worker serves the pages and the API. D1 is the transactional source of truth for auth, Templates, Runs, Organizations, entitlements, and audit history. R2 stores uploaded files.

## High-Level Components

- Frontend: Next.js App Router in `src/app` (routes, layouts, page metadata), with the screens in `src/views`.
- API: the router in `functions/api/[[route]].ts`, run for every `/api/*` request by the route handler `src/app/api/[[...route]]/route.ts`.
- Database: Cloudflare D1 through the `DB` binding, queried with Drizzle in `functions/api/db.ts`.
- Object storage: Cloudflare R2 bucket bound as `R2_UPLOADS`.
- Public discovery: XML sitemaps built in `functions/sitemap/` and the lookups behind the public pages' metadata in `functions/seo/` ([SEO and sitemaps](seo-and-sitemaps.md)).
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

Every page URL ends in a slash, and the other form redirects (308) to it (the SERP URL
standard, [FRONTEND.md](../FRONTEND.md#urls)); the API routes below do not, and are never
redirected. Canonical private routes use `/dashboard/*`:

- `/dashboard/templates/`
- `/dashboard/templates/new/`
- `/dashboard/templates/:id/`
- `/dashboard/templates/:id/edit/`
- `/dashboard/import-templates/`
- `/dashboard/runs/`
- `/dashboard/runs/:id/`
- `/dashboard/settings/`
- `/dashboard/archive/`

Public routes include:

- `/templates/`
- `/categories/`
- `/profile/:username/`
- `/profile/:username/:templateSlug/`
- `/share/:shareToken/`
- `/team-invites/:token/` (legacy compatibility route for Organization invites)

## API Routes

All routes are under `/api`. Organization routes keep the legacy `/api/teams`
identifiers, and Template and Run routes accept the legacy `teamId` parameter where
Organization scoping applies.

- Auth (Better Auth): `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session`, `GET /api/auth/status`
- Public profiles: `GET /api/profiles/by-username`, `GET /api/profiles/by-id`
- Templates: `GET /api/templates` (see [public and private data](#public-and-private-data)), `GET /api/templates/:id`, `GET /api/templates/slug/:slug`, `GET /api/templates/public?userId=...` (a Public Profile's templates), `GET /api/templates/archived`, `GET /api/templates/:id/history`, `POST /api/templates`, `PUT|DELETE /api/templates/:id` (`DELETE` archives), `POST /api/templates/:id/restore`, `POST /api/templates/:id/clone`, `GET|POST /api/templates/backup` (export and import, [portable templates](../product-specs/portable-templates.md)), `POST /api/templates/generate-from-clipy` (an unsaved draft from a public Clipy recording)
- Runs: `GET /api/checklists`, `GET /api/checklists/:id`, `GET /api/checklists/archived`, `GET /api/checklists/:id/history`, `POST /api/checklists` (the only `POST` that creates a run), `PUT|DELETE /api/checklists/:id` (`DELETE` archives), `POST /api/checklists/:id/restore`, `POST /api/checklists/:id/revalidate`, `POST|DELETE /api/checklists/run/:id/share` (share, or stop sharing), `GET|PUT /api/checklists/shared/:token` (the share link, no sign-in; [SECURITY.md](../SECURITY.md#model))
- Organizations: `GET|POST /api/teams`, `GET|PUT /api/teams/:teamId`, `GET /api/teams/:teamId/members`, `PUT /api/teams/:teamId/members/:memberId`, `PUT /api/teams/:teamId/owner`, invites, and activity (see [organizations](organizations.md))
- Billing: `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status`; Stripe webhook `POST /api/stripe/webhook`
- Agent access: `GET|POST /api/agent-keys`, `DELETE /api/agent-keys/:id`, `GET /api/agent-keys/connection`, and the MCP endpoint `POST /api/mcp` (see [agent access](agent-access.md))
- Uploads: `POST /api/uploads`, `GET|HEAD|DELETE /api/uploads/file?key=...`
- Health: `GET|HEAD /api/health`

The route handler `src/app/api/[[...route]]/route.ts` exports the same handler for every
method Next.js routes, `HEAD`, `PATCH` and `OPTIONS` included, so every `/api/*` request
reaches the API router (`functions/api/[[route]].ts`) instead of a page. A `HEAD` answer keeps
the status and headers the route builds and drops the body; routes that only check
for `GET` answer `HEAD` with their own `404` or `405`. The router gets a plain copy of the
request (method, headers, body and abort signal), because it builds new requests from the
one it gets and workerd's `Request` constructor does not take Next.js's `NextRequest` as its
input. The copy sets `duplex: 'half'`, which Node.js (`next dev`) requires for a streamed
body and workerd ignores.

Run responses include `template_version`, `current_template_version`, `revision`,
and derived `is_stale`. Send `expected_revision` when updating a run and
`expected_version` when updating a template; `POST /api/checklists/:id/revalidate`
reconciles and reopens a completed private run. A template update that changes
content (anything but visibility) without `expected_version` gets `409 edit_conflict`,
and `PUT /api/templates/:id` returns the new `version` and `content_version`, and the
`slug` the template has after the save (the requested one, suffixed if it was taken,
or the one it kept when none was requested). Saves resend every stored field, and stored
values can predate today's bounds (imports, clones, slugs that migrations 0002 and 0005
backfilled), so `PUT` checks only types on the wire and holds the fields that actually
change to the bounds once it has read the row. A blank slug, or the stored one echoed
back, keeps the stored slug even when today's rule rejects it, so unrelated saves never
fail or rewrite shared URLs; a new slug is normalized rather than refused, and one with
no Latin letters or digits to keep (`Список`) is a `400`. The
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

- `templates.items` stores sectioned template content. The API normalizes legacy flat items into a single section. A list is sectioned when its first entry is an object with `items`, even `items: null` (`isSectionedList` in `src/lib/schemas/storedSections.ts`); the payload check, the identity pass on Template writes and run reconciliation all use that rule.
- `templates.category` stores a JSON array of category strings.
- `templates.tags` stores a JSON array of tag strings.
- `templates.rules` stores template rule metadata.
- `checklist_runs.items` stores the current sectioned run content plus completion state. Every write of `templates.items` or `checklist_runs.items` from a request is checked against `src/lib/schemas/storedSections.ts` (lists are arrays, text is text, content blocks have a known type) and rejected with a 400 naming the path (a share-link save keeps the stored task structure and takes only completion and notes); content copied from a stored Template into a run, and content the app renders, is made safe first by the same module. `retired_items` stores removed sections/items/sub-items for history without counting them toward readiness. It is server-owned (only reconciliation and Revalidate write it), shown read-only on the private run page and in MCP `get_run` (with the run when it fits in one result, and on its own with `retired: true`, a page at a time, all of it or one `sectionId`'s or `taskId`'s), and stripped from shared-run responses.
- A run started from a template (web or MCP `start_run`) begins with every task and Sub-task unticked and no notes, whatever run state the stored template carries (`resetRunCompletionState` in `functions/api/utils/template-reconciliation.ts`).
- Template changes reconcile only active private runs by stable section/item/sub-item ID. Completed, archived, and shared runs keep their snapshot and become stale when their `template_version` trails the source template.
- `audit_events.before_json`, `after_json`, `diff_json`, and `metadata_json` store compact, size-capped audit payloads (see [data persistence](data-persistence.md)).
- `template_versions.snapshot_json` stores a point-in-time template snapshot.

## Authorization And Entitlements

- Better Auth session lookup is the only supported login state for normal user flows.
- API handlers enforce authorization; UI gating is secondary.
- User entitlements come from manual overrides, Stripe subscriptions, or the Free fallback (`functions/api/utils/entitlements.ts`). The local Pro personas get Pro from seeded override rows (`db/seeds/local.ts`), never from their email: anyone can register those addresses on a deployed environment.
- Organization entitlements come from the legacy `team_entitlement_overrides` table.
- Free limits are currently 1 Template and 3 active Runs. Paid Personal and Organization contexts have unlimited Templates and active Runs.
- The Template limit is enforced the same way: create, clone and restore count first for a clear error, then repeat the count inside the insert (`templateCapacityAvailableSql` in `functions/api/utils/template-writes.ts`).
- A count followed by a separate insert lets concurrent requests all pass a limit, so enforce the active Run limit inside the insert itself with the guarded statements in `functions/api/utils/active-run-limit.ts` (web run create and restore and MCP `start_run` do); a pre-check count only gives an early, friendly error.
- Every write that adds an `in_progress` run to a context counts against the limit of the run's owner context, not the actor's: create, restore, and reopening a completed run through revalidate, `PUT` status, the share link or MCP `set_run_status`. Reopens check it only before the write (TD-17).

## Audit And History

Production history is DB-backed:

- Organization create/update/invite/member/owner actions write `audit_events`.
- Template changes write `template_versions` and `audit_events`.
- Audit events include actor id, subject, resource, action, optional before/after/diff JSON (compacted: no run or template content, no share tokens), request id, hashed IP, user agent, and timestamp.
- The actions are listed once in `src/lib/schemas/auditActions.ts`. The audit builder accepts only those, and each history view (run and Template Changelogs, Organization activity) labels them from typed maps in `src/lib/auditLabels.ts`, so a new action needs a label before it type-checks. A guest's edit through a run's share link has no actor and shows as "Guest via shared link".

Do not use git history for user-generated Template or Organization history. Git only tracks code and migration history.

## File Uploads

- `POST /api/uploads` writes to R2 with a per-user key prefix.
- `GET /api/uploads/file?key=...` and `HEAD /api/uploads/file?key=...` serve objects with long-lived,
  `immutable` cache headers (a key holds a UUID, so its object never changes), single byte
  ranges (`206`, `416`), and `If-None-Match` revalidation (`304`) through
  `functions/api/utils/r2-file-response.ts`, always with `X-Content-Type-Options: nosniff`.
  Uploaded videos need ranges: Safari will not play one whose `Range: bytes=0-1` probe
  gets a `200`, and no browser can seek past what it has buffered. The API's responses
  do not pass through the CDN cache, so nothing else answers ranges for it. Several
  ranges, another unit or an invalid range get the whole file, which is always a valid
  answer. R2 throws for a range that starts at or past the end of the object, which is
  answered `416`, and the range an object reports can list every field with the unused
  ones undefined (workerd's local R2 does), so a suffix range is one whose `suffix` is a
  number. An `If-Range` that names another version gets the whole file, and a failed
  precondition answers `304` to a cache revalidation (`If-None-Match`,
  `If-Modified-Since`) and `412` otherwise.
- `DELETE /api/uploads/file?key=...` deletes only the signed-in user's own avatar
  (`avatars/<userId>/<file>`). Template uploads (`template-images/`, `template-videos/`,
  `template-files/`) answer `403 asset_referenced`: Templates, versions, Runs and clones
  may still reference them, so the editor only unlinks them (TD-19); see
  [database operations](database-operations.md#r2-uploads).

## Public And Private Data

- `GET /api/templates?scope=public` returns the public catalog, identical for every visitor and edge-cached for 5 minutes. `?scope=personal` returns the signed-in User's Personal Templates, and `?teamId=...` the authorized Organization's. With no parameter it returns public Templates plus the User's Personal Templates, for clients loaded before scopes existed (TD-15). Template list and detail responses carry the checklist as parsed `sections` only; the raw `items` column is not sent, since sending both would double every response.
- Public template responses carry only the allowlisted fields in `functions/api/utils/template-public.ts`. That covers the catalog, Public Profile lists, the public rows of the unscoped list, and slug or id reads by anyone other than the owner or a member of the owning Organization. They leave out `team_id`, `created_by_user_id`, `updated_by_user_id`, `deleted_at` and `content_version`, so they never reveal which Organization owns a Template or which members edited it. The creator stays attributed through `user_id` and the owner fields, and `owner_type` marks an Organization Template. Owners and Organization members still get the whole row.
- Public template detail routes are available through `/profile/:username/:templateSlug/`.
- Public profiles are available through `/api/profiles/by-username` and `/api/profiles/by-id`, for Users who have a username only.
- Shared run links use `/share/:shareToken/` and do not expose template editing.

## Deployment Environments

- Local D1: Miniflare state under `.wrangler/`.
- Staging/preview D1: `serp-checklists-staging-db` through `preview_database_id`, `[[env.preview.d1_databases]]`, and Wrangler's `--preview` flag.
- Production D1: `serp-checklists-db`.

Preview deployments must not point at production D1. See [database operations](database-operations.md).
