# Quality Score

- **Last graded:** 2026-10-01

Grades show where the next hour of cleanup pays off most. Re-grade a row when its
code changes materially. Each row names the code it grades (Code) and the day it was last
graded (Graded): the weekly [maintenance report](design-docs/agent-workflow.md#weekly-maintenance)
lists every row whose code changed since then under "Scores to re-grade", and the weekly doc
gardener re-grades them. Link each gap to the [tech debt tracker](exec-plans/tech-debt-tracker.md).

**Scale:** A = solid, change freely. B = sound, with known gaps. C = works, but
changes are risky or slow. D = needs attention before building on it.

## Product domains

| Domain | Code | Tests | Boundaries | Structure | Docs | Biggest gap | Graded |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identity and sessions | `functions/api/better-auth.ts`, `functions/api/utils/session.ts`, `src/contexts/CloudflareAuthContext.tsx` | B | B | B | A | Session checks read D1 (no Better Auth cookie cache), so re-checks must stay throttled | 2026-10-01 |
| Personal and Organization ownership | `functions/api/handlers/teams.ts`, `functions/api/utils/team-access.ts`, `src/contexts/WorkspaceProvider.tsx`, `src/lib/consoleRoutes.ts` | B | B | B | B | Legacy team/workspace naming in code identifiers (TD-5) | 2026-10-01 |
| Templates | `functions/api/handlers/templates.ts`, `src/views/TemplateDetail.tsx`, `src/views/TemplateEditor.tsx` | A | B | B | A | `TemplateDetail.tsx` (474 lines) is close to the 500-line limit | 2026-10-01 |
| Runs | `functions/api/handlers/checklists.ts`, `functions/api/utils/run-provenance.ts`, `src/views/ChecklistRun.tsx`, `src/components/dashboard/RunsDashboardView.tsx` | B | C | B | B | Completed runs are frozen only in the web app (TD-21); reopening checks the active-run limit outside the write (TD-17) | 2026-10-01 |
| Billing and entitlements | `functions/api/handlers/billing.ts`, `functions/api/handlers/stripe.ts`, `src/components/account/BillingSection.tsx` | B | B | B | A | Only 3 e2e specs exercise paid flows | 2026-10-01 |
| Agent access (Run Keys, MCP) | `functions/api/handlers/agentMcp.ts`, `src/components/account/AgentAccessSection.tsx` | B | B | B | D | No module doc for Run Keys and MCP | 2026-10-01 |
| Public discovery and SEO | `functions/sitemap/shared.ts`, `functions/seo/public-template-lookup.ts`, `src/views/ChecklistLibrary.tsx` | B | B | B | B | Sitemap `lastmod` depends on full git history in CI (now configured) | 2026-10-01 |
| Imports and uploads | `functions/api/handlers/template-backup.ts`, `functions/api/handlers/uploads.ts`, `functions/api/handlers/clipy.ts` | B | C | C | B | Clipy input parsed by hand; `clipy.ts` is close to the 500-line limit | 2026-10-01 |

## Layers and cross-cutting concerns

| Area | Code | Grade | Notes | Graded |
| --- | --- | --- | --- | --- |
| Type safety | `tsconfig.json`, `scripts/lint.ts` | A | `strict` plus `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature` across app, API, scripts and tests, all in `pnpm run typecheck`, with a guard against turning any off; ESLint refuses `!` and unsafe type assertions everywhere. Every script is TypeScript, and the repository's own declaration files are checked with `skipLibCheck` off, apart from the generated `cloudflare-env.d.ts` | 2026-10-01 |
| Boundary parsing | `src/lib/schemas/`, `src/lib/api/request.ts` | A | Every API response, Stripe reply, webhook body, stored JSON column and browser storage read is parsed with Zod, and the client's types derive from the schemas. ESLint refuses casts of external data, `as unknown as` and `as never`, `any`, and, type-aware, unsafe values and assertions in app, API, scripts and tests | 2026-10-01 |
| D1 cost efficiency | `functions/api/utils/d1-profiler.ts`, `scripts/d1-profile.ts`, `tests/integration/rows-read-budgets-local-d1.test.ts` | B | Run lists (Organization runs 12k at 40k runs, on the runs page only) and catalog cache misses (13k) still read in proportion to table size; the catalog and sitemaps are edge-cached, lists load on demand, and hot paths are indexed. See the [D1 cost plan](exec-plans/active/d1-cost.md) | 2026-10-01 |
| Architecture enforcement | `.dependency-cruiser.cjs`, `knip.json` | A | `deps:check` rules with no known violations and no baseline, now including npm packages; `deadcode:check` (knip) fails on unused files, exports, types and dependencies, with only the two recorded ignores | 2026-10-01 |
| Observability | `functions/api/utils/logger.ts`, `scripts/logs-query.ts` | C | Structured JSON logs with request IDs in the API and in `tmp/logs/` locally; no metrics, traces, or production log sink; frontend errors go to the console only | 2026-10-01 |
| Delivery | `.github/workflows/ci.yml`, `.github/workflows/deploy-staging.yml` | B | CI gates deploys and probes each new deployment; Claude reviews every PR once the app and token are set up; required status checks and that setup need a repository admin (see [agent workflow](design-docs/agent-workflow.md#repository-settings-admin-only)) | 2026-10-01 |
| Documentation | `scripts/check-docs.ts`, `scripts/maintenance-report.ts` | B | Fixed layout, links, paths, and catalogs are checked in CI; the database schema doc is generated; a weekly Claude doc-gardening agent re-verifies drifted docs and opens fix-up PRs | 2026-10-01 |
