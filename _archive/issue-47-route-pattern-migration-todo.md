# Issue 47: route pattern migration plan

Goal: migrate the public library route from `/checklists` to `/templates`, keep `/dashboard` as the canonical signed-in workspace family, and preserve compatibility redirects while the old URLs are phased out.

## Decisions locked by this plan

- [x] Make `/templates` the canonical public library route
- [x] Keep `/dashboard/...` as the canonical private workspace route family
- [x] Keep `/profile/{username}/{templateSlug}` as the canonical public template detail route
- [x] Keep `/share/{shareToken}` as the canonical shared run route
- [x] Treat `/checklists` and `/console` as temporary compatibility aliases only
- [x] Do not rename backend API endpoints in this issue; this is a frontend/browser URL migration, not an API contract rewrite
- [x] Do not add empty placeholder pages for future route families in this issue

## Implementation tasks

- [x] Flip the route helper contract in `src/lib/routes.ts` so `buildPublicTemplatesPath()` returns `/templates`
- [x] Rename and invert the public legacy constant so `/checklists` is treated as the compatibility route instead of `/templates`
- [x] Update `src/App.tsx` route definitions and redirects so `/templates` renders the public library and `/checklists` redirects to it
- [x] Keep `/console` redirects pointed at `/dashboard` and keep `/console/templates/*` and `/console/runs/*` as temporary aliases
- [x] Update shared public navigation and emitted links to point at `/templates`
- [x] Update public page copy and back-link text from “checklists” to “templates” where it refers to the public library route
- [x] Audit route helper consumers for stale assumptions, especially pages/components that fall back to the public library path
- [x] Resolve existing test drift where some tests already expect `/templates` while the helper still returns `/checklists`

## Tests and verification

- [x] Update unit coverage for route helpers so `/templates` is canonical and `/checklists` is the legacy alias
- [x] Update route/layout tests that assert public nav links, back links, or route classification
- [x] Update any page-level tests that hardcode `/checklists` as the library fallback
- [x] Update or add route-structure E2E coverage for:
  - `/templates` renders the public library
  - `/checklists` redirects to `/templates`
  - `/dashboard` remains canonical
  - `/console` redirects to `/dashboard`
  - `/templates/new`, `/templates/{id}`, and `/templates/{id}/edit` stay not found
- [x] Isolate the local Playwright harness so route verification does not attach to a stale `localhost:8080` service
- [x] Run typecheck
- [x] Run targeted lint on changed route, page, and test files
- [x] Perform real browser verification of the public library route and legacy redirects

## Documentation tasks

- [x] Replace the older `/checklists` canonical note in `_todo/MVP.md` once the migration is implemented
- [x] Update `docs/knowledge/public-private-route-model-2026-03-24.md` to the new canonical route contract after code lands
- [x] Keep `docs/knowledge/apify-route-pattern-comparison-2026-04-03.md` and `docs/knowledge/final-route-url-patterns-proposal-2026-04-03.md` as the design references for the migration
- [x] Add a post-implementation knowledge note that records the final redirect contract and any SEO/linking implications
- [x] Record the local Playwright/frontend/API origin contract so future route verification uses the isolated harness

## Future routes reserved but not implemented in issue 47

- [ ] Reserve content-type library routes under `/templates/...`, for example `/templates/prompts` and `/templates/skills`
- [ ] Reserve template lifecycle routes under `/dashboard/templates/{templateId}/...`, for example `versions`, `publish-jobs`, and optional `builds`
- [ ] Reserve richer run history under `/dashboard/runs/{runId}` with hash subviews such as `#output`, `#log`, and `#input`
- [ ] Reserve optional template-scoped run views under `/dashboard/templates/{templateId}/runs/...`
