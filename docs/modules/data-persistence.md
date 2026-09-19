# Data Persistence Module

The persistence layer uses Cloudflare D1 for transactional data, Cloudflare Pages Functions for API access, Cloudflare R2 for uploads, and TanStack React Query for client-side caching.

## Related Files

- `functions/api/[[route]].ts` - API router.
- `functions/api/db.ts` - Drizzle D1 client.
- `functions/api/handlers/` - Auth, billing, Stripe, templates, checklists, teams, admin, and uploads handlers.
- `functions/api/utils/session.ts` - Better Auth session lookup.
- `functions/api/utils/entitlements.ts` - User and team entitlement resolution.
- `functions/api/utils/team-access.ts` - Team membership and role authorization helpers.
- `functions/api/utils/audit.ts` - Audit event value builder.
- `db/schema/` - Drizzle schema used by runtime queries.
- `db/schema.sql` - maintained reference snapshot for local inspection.
- `db/types/` - Drizzle model types.
- `db/migrations/*.sql` - D1 schema history.
- `db/seeds/` - local and official seed data.
- `db/maintenance/` - one-off maintenance SQL that is not schema history.
- `src/lib/api.ts` - Client API wrapper.
- `src/contexts/WorkspaceContext.tsx` - Personal/team workspace state.
- `src/contexts/TemplatesContext.tsx` - Templates and runs with React Query.
- `src/lib/utils/templateBackup.ts` - Import/export helpers.
- `src/lib/repoTemplateCatalog.ts` - Repo-backed portable template catalog.
- `src/data/public-template-packs/*.json` - Repo-backed public template packs.

## Source Of Truth

- Migration files in `db/migrations/` define schema history.
- D1 records applied migrations in `d1_migrations`.
- Drizzle schema in `db/schema/` mirrors the SQL for runtime queries.
- `db/schema.sql` is a reference snapshot only.

Do not add seed data to migrations. Use `db/seeds/` for repeatable local/staging seed data and `db/maintenance/` for explicit one-off maintenance tasks.

## Core Tables

- `users`: auth identity and profile data.
- `account`, `session`, `verification`: Better Auth persistence.
- `templates`: template metadata, JSON content, visibility, public profile routing, owner scope, team scope, attribution, and soft-delete state.
- `checklist_runs`: run state, progress, share fields, team scope, assignment/actor attribution, and soft-delete state.
- `template_likes`: favorites.
- `usage_analytics`: product event log.
- `stripe_customers`, `stripe_subscriptions`, `stripe_webhook_events`: billing records and webhook idempotency.
- `entitlement_overrides`: user-level plan overrides.
- `teams`: team identity and billing/creator metadata.
- `team_members`: membership, role, and status.
- `team_invites`: hashed link invites and acceptance/revocation state.
- `team_entitlement_overrides`: team-level plan overrides.
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

## Workspace Ownership

Personal data uses user ownership. Team data uses team ownership.

- Personal templates: `templates.owner_type = 'user'`, `templates.user_id = current user`, `templates.team_id IS NULL`.
- Team templates: `templates.owner_type = 'team'`, `templates.team_id = active team`, with creator/updater attribution on user columns.
- Personal runs: `checklist_runs.user_id = current user`, `checklist_runs.team_id IS NULL`.
- Team runs: `checklist_runs.team_id = active team`, with creator/started/completed user attribution.

Handlers must authorize team access before returning or mutating team-scoped rows. Do not trust a client-supplied `teamId` without checking membership and role.

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

`src/contexts/TemplatesContext.tsx` uses TanStack React Query for templates and runs. Query keys include workspace scope so personal and team data do not bleed together. Workspace switching invalidates template and run queries.

Team lists are fetched by `WorkspaceContext` and keyed by current user id.

Billing query keys are also user-scoped. A session change must not reuse another
user's cached entitlement response, and the UI should show a neutral loading
state until the current user's plan is known.

## Import/Export

Template backup and portable import/export are implemented through `src/lib/utils/templateBackup.ts` and the template backup API routes. Team imports/exports pass `teamId` so imported templates land in the selected team workspace when authorized.

The portable contract is shared by uploaded files and repo-backed public packs.
Repo packs live in `src/data/public-template-packs/*.json` and are normalized by
the same validation path as uploaded packs. If a repo pack and D1 template have
the same public slug, the repo entry wins in the public catalog. Saving a repo
template creates a private D1 template; starting a run uses its normalized
sections and does not require a source D1 row.

Create and update saves are awaitable end to end. UI success and navigation
must wait for confirmed persistence, and update flows must preserve existing
portable metadata such as `rules` when it is not being edited.

See [the template schema](../schema/README.md) for versioning, metadata
round-trip, and structured import-result contracts.

## Shared-run links

Sharing is run-scoped. Each share action mints a fresh token for the current
run and deactivates any previously active shared run for the same user/template
so older guest links do not remain active or count toward active-run limits.
The public guest URL is `/share/:token`. When sharing fails, distinguish an
entitlement `limit_reached` response from schema/migration failures before
changing sharing logic.

## Seeds

`pnpm run db:seed` seeds local D1 with dev users, sample personal data, team data, team memberships, pending invites, entitlement overrides, and official public templates.

Use `pnpm run db:seed:official:staging` for staging official templates only. Do not seed test users into production.
