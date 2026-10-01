# Quality Score

- **Last graded:** 2026-09-30

Grades show where the next hour of cleanup pays off most. Re-grade a row when its
code changes materially; the weekly [maintenance report](design-docs/agent-workflow.md#weekly-maintenance)
reminds you. Link each gap to the [tech debt tracker](exec-plans/tech-debt-tracker.md).

**Scale:** A = solid, change freely. B = sound, with known gaps. C = works, but
changes are risky or slow. D = needs attention before building on it.

## Product domains

| Domain | Tests | Boundaries | Structure | Docs | Biggest gap |
| --- | --- | --- | --- | --- | --- |
| Identity and sessions | B | B | B | A | Session checks read D1 (no Better Auth cookie cache), so re-checks must stay throttled |
| Personal and Organization ownership | B | B | B | B | Legacy team/workspace naming in code identifiers (TD-5) |
| Templates | A | B | B | A | `TemplatesContext.tsx` and `TemplateDetail.tsx` are close to the 500-line limit |
| Runs | B | C | B | B | Completed runs are frozen only in the web app (TD-21); reopening checks the active-run limit outside the write (TD-17) |
| Billing and entitlements | B | B | B | A | Only 3 e2e specs exercise paid flows |
| Agent access (Run Keys, MCP) | B | B | B | D | No module doc for Run Keys and MCP |
| Public discovery and SEO | B | B | B | B | Sitemap `lastmod` depends on full git history in CI (now configured) |
| Imports and uploads | B | C | C | B | Clipy input parsed by hand; `clipy.ts` is close to the 500-line limit |

## Layers and cross-cutting concerns

| Area | Grade | Notes |
| --- | --- | --- |
| Type safety | A | `strict` across app, API, scripts and tests, all in `pnpm run typecheck`, and a test fails on any TypeScript file no checked tsconfig includes; the stricter flags reach the tests in phase 4 round 6 |
| Client boundary parsing | D | API responses are trusted, not parsed (TD-2) |
| D1 cost efficiency | B | Run lists (Organization runs 12k at 40k runs, on the runs page only) and catalog cache misses (13k) still read in proportion to table size; the catalog and sitemaps are edge-cached, lists load on demand, and hot paths are indexed. See the [D1 cost plan](exec-plans/active/d1-cost.md) |
| Architecture enforcement | A | `deps:check` rules with no known violations and no baseline; no dead modules |
| Observability | C | Structured JSON logs with request IDs in the API and in `tmp/logs/` locally; no metrics, traces, or production log sink; frontend errors go to the console only |
| Delivery | B | CI gates deploys and probes each new deployment; Claude reviews every PR once the app and token are set up; required status checks and that setup need a repository admin (see [agent workflow](design-docs/agent-workflow.md#repository-settings-admin-only)) |
| Documentation | B | Fixed layout, links, paths, and catalogs are checked in CI; the database schema doc is generated; a weekly Claude doc-gardening agent re-verifies drifted docs and opens fix-up PRs |
