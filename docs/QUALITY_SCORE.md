# Quality Score

- **Last graded:** 2026-09-27

Grades show where the next hour of cleanup pays off most. Re-grade a row when its
code changes materially; the weekly [maintenance report](design-docs/agent-workflow.md#weekly-maintenance)
reminds you. Link each gap to the [tech debt tracker](exec-plans/tech-debt-tracker.md).

**Scale:** A = solid, change freely. B = sound, with known gaps. C = works, but
changes are risky or slow. D = needs attention before building on it.

## Product domains

| Domain | Tests | Boundaries | Structure | Docs | Biggest gap |
| --- | --- | --- | --- | --- | --- |
| Identity and sessions | B | B | B | A | 401 handling in the app client (TD-10) |
| Personal and Organization ownership | B | B | C | B | Legacy team/workspace naming in code identifiers (TD-5); `teams.ts` is about 1,050 lines |
| Templates | A | C | D | A | `templates.ts` handler is about 1,600 lines; hand-normalized `sections` (TD-3, TD-8) |
| Runs | B | C | C | B | `checklists.ts` is about 1,200 lines; `ChecklistRun.tsx` is near its cap |
| Billing and entitlements | B | B | B | A | Only 3 e2e specs exercise paid flows |
| Agent access (Run Keys, MCP) | B | B | C | D | No module doc for Run Keys and MCP; `agentMcp.ts` is about 900 lines |
| Public discovery and SEO | B | B | B | B | Sitemap `lastmod` depends on full git history in CI (now configured) |
| Imports and uploads | B | C | C | B | Clipy input parsed by hand; `TemplateBackup.tsx` is about 640 lines |

## Layers and cross-cutting concerns

| Area | Grade | Notes |
| --- | --- | --- |
| Type safety | B | `strict` across app, API, and scripts; `tests/` not type-checked (TD-1) |
| Client boundary parsing | D | API responses are trusted, not parsed (TD-2) |
| Architecture enforcement | B | `deps:check` rules with 10 known violations (TD-6, TD-13); no dead modules |
| Observability | C | Structured JSON logs with request IDs in the API and in `tmp/logs/` locally; no metrics, traces, or production log sink; frontend errors go to the console only |
| Delivery | B | CI gates deploys and probes each new deployment; required status checks still need a repository admin (see [agent workflow](design-docs/agent-workflow.md#repository-settings-admin-only)) |
| Documentation | B | Fixed layout, links, paths, and catalogs are checked in CI; the database schema doc is generated; content freshness depends on weekly gardening |
