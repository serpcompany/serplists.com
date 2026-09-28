# Data Persistence

The persistence layer uses Cloudflare D1 for transactional data, Cloudflare Pages Functions for API access, Cloudflare R2 for uploads, and TanStack React Query for client-side caching.

## Related Files

- `functions/api/[[route]].ts` - API router.
- `functions/api/db.ts` - Drizzle D1 client.
- `functions/api/handlers/` - Auth, billing, Stripe, Templates, Runs, Organizations, admin, and uploads handlers; Organization handler filenames retain legacy `team` names.
- `functions/api/utils/session.ts` - Better Auth session lookup.
- `functions/api/utils/entitlements.ts` - Personal and Organization entitlement resolution.
- `functions/api/utils/team-access.ts` - Organization Membership and role authorization helpers; filename is legacy.
- `functions/api/utils/audit.ts` - Audit event value builder.
- `db/schema/` - Drizzle schema used by runtime queries.
- `db/schema.sql` - maintained reference snapshot for local inspection.
- `db/types/` - Drizzle model types.
- `db/migrations/*.sql` - D1 schema history.
- `db/seeds/` - local and official seed data.
- `db/maintenance/` - one-off maintenance SQL that is not schema history.
- `src/lib/api.ts` - Client API wrapper.
- `src/contexts/WorkspaceContext.tsx` - Personal/Organization context state; filename is legacy.
- `src/contexts/TemplatesContext.tsx` - Templates and runs with React Query.
- `src/lib/utils/templateBackup.ts` - Import/export helpers.
- `src/lib/repoTemplateCatalog.ts` - Repo-backed portable template catalog.
- `src/data/public-template-packs/*.json` - Repo-backed public template packs.

## Source Of Truth

Schema ownership, migrations, seeds, and environments are described in
[database operations](database-operations.md). The current tables and columns are
generated into [generated/db-schema.md](../generated/db-schema.md).

## Runtime access (Drizzle on D1)

`functions/api/db.ts` wraps the binding: `createDb(env)` returns
`drizzle(env.DB, { schema })` from `drizzle-orm/d1`, using `db/schema/index.ts`.
API responses stay snake_case to match the current frontend mapping, and JSON
columns are stored as text and parsed in handlers.

## Core Tables

- `users`: auth identity and profile data.
- `account`, `session`, `verification`: Better Auth persistence.
- `templates`: Template metadata, JSON content, visibility, Public Profile routing, Resource Owner scope, attribution, and soft-delete state.
- `checklist_runs`: Run state, progress, share fields, Resource Owner scope, assignment/actor attribution, and soft-delete state.
- `template_likes`: favorites.
- `usage_analytics`: product event log.
- `stripe_customers`, `stripe_subscriptions`, `stripe_webhook_events`: billing records and webhook idempotency.
- `entitlement_overrides`: user-level plan overrides.
- `teams`: legacy implementation table for Organization identity and billing/creator metadata.
- `team_members`: legacy implementation table for Organization Membership, role, and status.
- `team_invites`: legacy implementation table for hashed Organization invites and their lifecycle.
- `team_entitlement_overrides`: legacy implementation table for Organization-level plan overrides.
- `audit_events`: DB-backed actor/resource/action history.
- `template_versions`: point-in-time template snapshots.

## JSON Columns

- `templates.items`: sectioned template content.
- `templates.category`: JSON array of category strings.
- `templates.tags`: JSON array of tag strings.
- `templates.rules`: template rule metadata.
- `checklist_runs.items`: sectioned run content with completion state.
- `audit_events.before_json`, `after_json`, `diff_json`, `metadata_json`: structured audit payloads.
- `template_versions.snapshot_json`: full template snapshot.

## Resource Ownership

Personal data uses User ownership. Organization data uses Organization ownership.

- Personal templates: `templates.owner_type = 'user'`, `templates.user_id = current user`, `templates.team_id IS NULL`.
- Organization Templates: `templates.owner_type = 'team'`, `templates.team_id = active Organization`, with creator/updater attribution on User columns. The stored `team` values are legacy identifiers.
- Personal runs: `checklist_runs.user_id = current user`, `checklist_runs.team_id IS NULL`.
- Organization Runs: `checklist_runs.team_id = active Organization`, with creator/started/completed User attribution.

Handlers must authorize Organization access before returning or mutating Organization-scoped rows. Do not trust the legacy client-supplied `teamId` without checking Organization Membership and role.

## API Access

Client requests go through `src/lib/api.ts`, which uses:

- `http://localhost:8788/api` in dev unless `VITE_API_URL` overrides it.
- `/api` in deployed environments.
- Better Auth cookies for session state.

Main server handlers:

- `functions/api/handlers/auth.ts`
- `functions/api/handlers/billing.ts`
- `functions/api/handlers/stripe.ts`
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `functions/api/handlers/teams.ts`
- `functions/api/handlers/admin.ts`
- `functions/api/handlers/uploads.ts`

## Caching And Invalidations

`src/contexts/TemplatesContext.tsx` uses TanStack React Query for Templates and Runs. Query keys include ownership context so Personal and Organization data do not bleed together. Context switching invalidates Template and Run queries.

History queries (the run and Template Changelogs) take their keys from `src/lib/queryCache.ts`, which also holds the refreshes that saves run, since every save writes an audit event:

- The run page refreshes the run Changelog once its save queue is idle after a save, not once per click (each refetch reads D1). Revalidating a run refreshes it too.
- Saving a Template (in the editor, or its visibility on the detail page) and sharing it refresh every cached Changelog of that Template, whatever user or Organization loaded it. Archiving a Template drops its Changelog.

Organization lists are fetched by the legacy-named `WorkspaceContext` and keyed by current User ID.

Billing query keys are also user-scoped. A session change must not reuse another
user's cached entitlement response, and the UI should show a neutral loading
state until the current user's plan is known.

## Import/Export

Template backup and portable import/export are implemented through `src/lib/utils/templateBackup.ts` and the Template backup API routes. Organization imports/exports pass the legacy `teamId` parameter so imported Templates land in the selected Organization when authorized.

The portable contract is shared by uploaded files and repo-backed public packs.
Repo packs live in `src/data/public-template-packs/*.json` and are normalized by
the same validation path as uploaded packs. If a repo pack and D1 template have
the same public slug, the repo entry wins in the public catalog. Saving a repo
template creates a private D1 template; starting a run uses its normalized
sections and does not require a source D1 row.

Create and update saves are awaitable end to end. UI success and navigation
must wait for confirmed persistence, and update flows must preserve existing
portable metadata such as `rules` when it is not being edited.

See the [portable template spec](../product-specs/portable-templates.md) for versioning, metadata
round-trip, and structured import-result contracts.

## Shared-run links

Sharing is run-scoped. Each share action mints a fresh token for the current
run and deactivates any previously active shared run for the same user/template
so older guest links do not remain active or count toward active-run limits.
The public guest URL is `/share/:token`. When sharing fails, distinguish an
entitlement `limit_reached` response from schema/migration failures before
changing sharing logic.

Because each share mints a new token, the UI treats creating the link and copying it
as separate steps (`src/lib/shareLink.ts`). The created link is always shown in a
dialog (`ShareLinkDialog`), copying is best effort through `copyTextToClipboard`
(Safari refuses a clipboard write that follows a network request), and an error is
reported only when the API call fails. Reopening the dialog for the same run reuses
the link instead of minting another token. ESLint bans direct `navigator.clipboard`
access outside `src/lib/clipboard.ts`.

## Seeds

`pnpm run db:seed` seeds local D1 with dev Users, sample Personal data, Organization data and memberships, pending invites, entitlement overrides, and official public Templates. Seed identifiers retain legacy `team` names.

Use `pnpm run db:seed:official:staging` for staging official templates only. Do not seed test users into production.
