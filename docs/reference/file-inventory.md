# File Inventory

## Top-level structure
```
serp-checklists/
├── src/                 # React app
├── functions/           # Cloudflare Pages Functions API
├── db/                  # D1 schema + migrations + seed data
├── tests/               # Vitest suites
├── public/              # Static assets
├── docs/                # Documentation
├── wrangler.toml        # Cloudflare bindings
├── vite.config.ts       # Vite config
├── playwright.config.ts # Playwright config
├── lefthook.yml         # Git hooks
├── tailwind.config.ts   # Tailwind config
└── package.json         # Scripts and dependencies
```

## Entry points
- `src/main.tsx` - React app bootstrap
- `src/App.tsx` - Routing, providers, and layout
- `functions/api/[[route]].ts` - API router for Pages Functions
- `src/lib/api.ts` - Client API wrapper used by the app

## API (Cloudflare Pages Functions)
- `functions/api/handlers/auth.ts`
- `functions/api/handlers/templates.ts`
- `functions/api/handlers/checklists.ts`
- `functions/api/handlers/uploads.ts`
- `functions/api/db.ts` (Drizzle D1 client)
- `functions/api/env.ts` (env validation)
- `functions/api/utils/jwt.ts`
- `functions/api/utils/slug.ts`
- `functions/api/utils/payloads.ts` (payload normalization + Zod validation)
- `functions/api/utils/response.ts` (shared JSON response helpers)

## Data and migrations
- `db/schema.sql` (maintained snapshot for reference; `db/migrations/` is the source of truth)
- `db/schema/` (Drizzle schema used by API handlers; entry `db/schema/index.ts`)
- `db/types/` (Drizzle model types)
- `db/drizzle.config.ts` (Drizzle Kit config)
- `db/migrations/0001_initial_schema.sql` (core tables)
- `db/migrations/0002_add_slug_to_templates.sql`
- `db/migrations/0002_add_username_and_profiles.sql`
- `db/migrations/0003_unique_template_slugs.sql`
- `db/migrations/0004_remove_affiliate_and_pages.sql`
- `db/migrations/0005_backfill_template_slugs.sql`
- `db/migrations/0006_seed_official_templates.sql`
- `db/migrations/0007_add_checklist_run_progress.sql`
- `db/migrations/seed-test-data.sql` (dev test users and sample data)

## App state and services
- `src/contexts/CloudflareAuthContext.tsx` - Auth state and profile refresh
- `src/contexts/TemplatesContext.tsx` - Templates and runs with React Query
- `src/lib/analytics.ts` - In-memory analytics helper
- `src/lib/utils/fileUpload.ts` - Client upload helpers (R2)
- `src/lib/utils/templateBackup.ts` - Import/export helpers

## Feature areas
- `src/pages/` - Route-level pages (login, register, dashboard, templates, runs, profiles)
- `src/components/template-editor/` - Template editor UI
- `src/components/checklist/` - Checklist run UI
- `src/components/shared/` - Reusable UI helpers
- `src/components/ui/` - shadcn/ui components

## Tests
- `tests/unit/` - Unit tests for schemas, utils, contexts, and API
- `tests/integration/` - API integration tests
- `tests/e2e/` - Playwright smoke/e2e tests

## Legacy or unused code
- `src/lib/api/client.ts` is not referenced by the app.
