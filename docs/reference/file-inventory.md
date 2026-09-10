# File Inventory

## Top-Level Structure

```text
serplists.com/
|-- src/                 # React app
|-- functions/           # Cloudflare Pages Functions API
|-- db/                  # D1 schema, migrations, seeds, and maintenance SQL
|-- tests/               # Vitest and Playwright suites
|-- public/              # Static assets
|-- docs/                # Documentation
|-- scripts/             # Dev, D1, verification, and generation scripts
|-- .github/workflows/   # CI and Cloudflare Pages deploy workflows
|-- wrangler.toml        # Cloudflare Pages, D1, and R2 bindings
|-- vite.config.ts       # Vite config
|-- vitest.config.ts     # Vitest config
|-- playwright.config.ts # Playwright config
|-- lefthook.yml         # Git hooks
|-- tailwind.config.ts   # Tailwind config
`-- package.json         # Scripts and dependencies
```

## Entry Points

- `src/main.tsx` - React app bootstrap.
- `src/App.tsx` - Routing, providers, and layout.
- `functions/api/[[route]].ts` - API router for Pages Functions.
- `src/lib/api.ts` - Client API wrapper used by the app.

## API

- `functions/api/handlers/admin.ts`
- `functions/api/handlers/auth.ts`
- `functions/api/handlers/billing.ts`
- `functions/api/handlers/stripe.ts`
- `functions/api/handlers/teams.ts`
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `functions/api/handlers/uploads.ts`
- `functions/api/db.ts` - Drizzle D1 client.
- `functions/api/env.ts` - Env validation.
- `functions/api/utils/audit.ts`
- `functions/api/utils/auth-secret.ts`
- `functions/api/utils/body.ts`
- `functions/api/utils/cors.ts`
- `functions/api/utils/crypto.ts`
- `functions/api/utils/entitlements.ts`
- `functions/api/utils/jwt.ts`
- `functions/api/utils/logger.ts`
- `functions/api/utils/payloads.ts`
- `functions/api/utils/rate-limit.ts`
- `functions/api/utils/response.ts`
- `functions/api/utils/session.ts`
- `functions/api/utils/slug.ts`
- `functions/api/utils/stripe.ts`
- `functions/api/utils/team-access.ts`
- `functions/api/utils/team-invite-delivery.ts`

## Data And Migrations

- `db/schema.sql` - maintained snapshot for reference.
- `db/schema/` - Drizzle schema used by API handlers; entry is `db/schema/index.ts`.
- `db/types/` - Drizzle model types.
- `db/drizzle.config.ts` - Drizzle Kit config.
- `db/migrations/` - numbered D1 migration files tracked in D1's `d1_migrations` table.
- `db/seeds/local.ts` - Drizzle-owned local dev fixtures and official publisher login support.
- `db/seeds/official-templates.sql` - official public template seed.
- `db/maintenance/` - one-off maintenance operations that should not be tracked as schema history.

Current migrations:

- `0001_initial_schema.sql`
- `0002_add_slug_to_templates.sql`
- `0002_add_username_and_profiles.sql`
- `0003_unique_template_slugs.sql`
- `0004_remove_affiliate_and_pages.sql`
- `0005_backfill_template_slugs.sql`
- `0007_add_checklist_run_progress.sql`
- `0008_better_auth.sql`
- `0009_stripe_billing.sql`
- `0010_entitlement_overrides.sql`
- `0011_add_template_version.sql`
- `0012_cleanup_junk_templates.sql`
- `0013_add_template_type.sql`
- `0014_make_users_password_hash_nullable.sql`
- `0015_add_users_created_at_default.sql`
- `0016_users_password_hash_nullable_live_safe.sql`
- `0017_add_checklist_run_sharing_fields.sql`
- `0018_rename_test_users.sql`
- `0019_add_template_seo_fields.sql`
- `0020_add_template_rules.sql`
- `0021_add_teams_audit_history.sql`
- `0022_enforce_single_active_team_owner.sql`

## App State And Services

- `src/contexts/CloudflareAuthContext.tsx` - Auth state and profile refresh.
- `src/contexts/WorkspaceContext.tsx` - Personal/team workspace selection and role capabilities.
- `src/contexts/TemplatesContext.tsx` - Templates and runs with React Query.
- `src/lib/api.ts` - Main API client.
- `src/lib/routes.ts` - Canonical route builders and legacy route aliases.
- `src/lib/analytics.ts` - In-memory analytics helper.
- `src/lib/utils/fileUpload.ts` - Client upload helpers for R2.
- `src/lib/utils/templateBackup.ts` - Import/export helpers.

## Feature Areas

- `src/pages/` - Route-level pages.
- `src/pages/DashboardSettings.tsx` - Account settings, billing, teams, members, invites, and incoming invites.
- `src/pages/TeamInviteAccept.tsx` - Link-based team invite acceptance.
- `src/components/template-editor/` - Template editor UI.
- `src/components/checklist/` - Checklist run UI.
- `src/components/shared/` - Reusable UI helpers.
- `src/components/ui/` - shadcn/ui components.

## Tests

- `tests/unit/` - Unit tests for schemas, utils, contexts, pages, components, scripts, and API handlers.
- `tests/integration/` - API integration tests.
- `tests/e2e/` - Playwright smoke/e2e tests.
- `tests/e2e/team-workspace.spec.ts` - Workspace switching and team behavior.
- `tests/e2e/team-invite-flow.spec.ts` - Link invite and settings invite acceptance flow.

## CI And Deploy

- `.github/workflows/ci.yml` - Quality gate for pull requests and pushes to `main`/`staging`.
- `.github/workflows/cloudflare-pages-deploy.yml` - Cloudflare Pages deploy with staging/production D1 readiness checks.
- `scripts/check-preview-d1-binding.mjs` - Verifies Wrangler and Pages preview D1 bindings are configured and separate from production.
- `scripts/check-production-d1-schema.mjs` - Read-only D1 schema readiness check for staging/production.
- `scripts/d1-baseline-migrations.mjs` - One-time D1 migration ledger baseline helper.
- `scripts/d1-reset-local.mjs` - Local D1 reset/migrate/seed helper.
- `scripts/dev-auto.mjs` - Local frontend/API dev server helper.
- `scripts/secret-scan.mjs` - Lightweight secret scanning hook.

## Legacy Or Compatibility Code

- `/console/*`, `/account`, and `/dashboard/profile` are legacy route aliases or redirects. New docs and UI should use `/dashboard/*`.
- `src/pages/Account.tsx` is legacy account page code; `/dashboard/settings` is canonical.
