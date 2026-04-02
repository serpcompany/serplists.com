# Public library route migration (2026-04-03)

Issue `#47` migrated the canonical public library route from `/checklists` to `/templates`.

## Final contract

- `/templates` is the canonical public library route
- `/checklists` is a compatibility redirect to `/templates`
- `/dashboard/...` remains the canonical signed-in workspace route family
- `/console` remains a compatibility redirect to `/dashboard`
- Public template detail stays on `/profile/{username}/{templateSlug}`
- Shared run detail stays on `/share/{shareToken}`
- `/templates/new`, `/templates/{id}`, and `/templates/{id}/edit` stay not found

## Why this changed

`/templates` matches the product object better than `/checklists`, especially now that the public library is expanding beyond a narrow checklist-only mental model. The Apify comparison also reinforced that the public discovery surface should read like a reusable library while the signed-in workspace keeps its own operational route family.

## Implementation notes

- The route helper contract now emits `/templates`
- The old public-library alias constant now points at `/checklists`
- Public navigation and fallback links were updated to emit `/templates`
- Public-library copy was updated on the main browse surfaces so users see “templates” instead of “checklists” when navigating the library

## Verification

- `pnpm exec vitest run tests/unit/lib/routes.test.ts tests/unit/components/Layout.test.ts tests/unit/components/PublicPageLayout.test.tsx tests/unit/pages/ChecklistLibrary.test.tsx tests/unit/pages/ChecklistLibraryLayout.test.tsx`
- `pnpm run typecheck`
- `pnpm exec eslint src/lib/routes.ts src/App.tsx src/components/layout/publicSiteLinks.ts src/components/Layout.tsx src/components/template/PublicTemplateView.tsx src/components/checklist-library/CategoryNavigation.tsx src/components/checklist-library/SearchAndFilters.tsx src/components/checklist-library/TemplateCard.tsx src/pages/ChecklistLibrary.tsx src/pages/PublicTemplate.tsx src/pages/UserProfile.tsx src/pages/Templates.tsx src/pages/Dashboard.tsx tests/unit/lib/routes.test.ts tests/unit/components/Layout.test.ts tests/unit/components/PublicPageLayout.test.tsx tests/unit/pages/ChecklistLibraryLayout.test.tsx tests/e2e/route-structure.spec.ts`
- Manual browser verification on an isolated dev server at `http://localhost:4173`:
  - `/templates` renders the public library UI
  - `/checklists` redirects to `/templates`
  - `/templates/new` remains not found
  - `/console` redirects into the dashboard flow and then auth

## Local verification harness

Route verification now uses an isolated Playwright frontend origin instead of assuming `http://localhost:8080` is safe to reuse. The supporting frontend/API origin contract is recorded in `docs/knowledge/playwright-local-origin-harness-2026-04-03.md`.
