# Public/private route model (2026-03-24)

The public IA was realigned to match the audited live site and to stop the repo from drifting away from what users actually see.

## Canonical route families

### Public discovery and sharing

- `/`
- `/templates`
- `/categories`
- `/categories/{categorySlug}`
- `/profile/{username}/{templateSlug}`
- `/features`
- `/features/{featureSlug}`
- `/pricing`
- `/about`
- `/contact`
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/share/{shareToken}`

### Private dashboard

- `/dashboard`
- `/dashboard/templates`
- `/dashboard/templates/new`
- `/dashboard/templates/{templateId}`
- `/dashboard/templates/{templateId}/edit`
- `/dashboard/runs`
- `/dashboard/runs/{runId}`
- `/account`

## Compatibility redirects

- `/checklists` redirects to `/templates`
- `/console` redirects to `/dashboard`
- Legacy console deep links under `/console/templates/*` and `/console/runs/*` still resolve to the dashboard shell while canonical links should be emitted under `/dashboard/*`

## Removed mixed-surface routes

- `/templates/new`
- `/templates/{id}`
- `/templates/{id}/edit`
- `/run/{id}`

## Important rules

- Public template URLs stay under `/profile/{username}/{templateSlug}`.
- `/templates` is the canonical public library path.
- `/dashboard` is the canonical signed-in workspace path.
- Public header, mobile nav, and footer links now come from one shared config in `src/components/layout/publicSiteLinks.ts`.
- The footer intentionally stays lean: `Company`, `Support`, and `Network`.
- `/templates/new` must stay not found so public discovery and signed-in creation do not collapse back into one surface.
- Shared runs use `/share/{shareToken}` and must stay `noindex, nofollow`.

## Verification used

- `pnpm exec vitest run tests/unit/lib/routes.test.ts tests/unit/components/Layout.test.ts tests/unit/components/PublicPageLayout.test.tsx tests/unit/pages/ChecklistLibrary.test.tsx tests/unit/pages/ChecklistLibraryLayout.test.tsx`
- `pnpm run typecheck`
- Targeted eslint on changed route, page, and test files
- `pnpm exec playwright test tests/e2e/route-structure.spec.ts` currently hits a stale service on `localhost:8080`, so it does not yet verify this migration reliably in the current local environment
- Manual browser verification is still required against an isolated local dev server for:
  - `/templates`
  - `/checklists`
  - `/templates/new`
  - `/console`
