# Quality

A grade for each product area and layer, from what the repository holds: its automated tests,
whether CI runs them before a pull request merges, whether docs describe its behavior, and what is
still checked by hand. Each row names the code its grade covers (Code) and the day it was last
graded (Graded, in UTC). The line under each table gives the evidence for each grade and the main
gap, which is what would raise it. Known debt, each item with its issue, is in
[`tech-debt.md`](tech-debt.md) and [`harness-debt.md`](harness-debt.md).

The weekly maintenance report lists every row whose code changed after the day it was graded,
under "Scores to re-grade", and doc gardening re-grades those rows
([`ci-agents.md`](agents/ci-agents.md), Weekly maintenance). A folder in Code counts as changed
when any file in it changes.

| Grade | Means |
| --- | --- |
| A | Tests cover the behavior, CI runs them on every pull request that changes it, and docs describe it. What's left is small and tracked. |
| B | Tests, CI and docs cover the main behavior, but a notable part is checked only by hand, or not at all. |
| C | Tests and docs exist, but one leg is missing: no CI runs the tests before merge, or no doc describes the behavior. |
| D | Almost nothing is tested, run before merge, or written down. |

"By hand" means a person or an agent checking the running site, with the `verify-web` skill or
`pnpm run ui:snap`. On every pull request, and in the merge queue once it's on, CI runs the unit
and local D1 tests and every browser spec on the production build ([`ci.md`](agents/ci.md)), so
the browser specs guard a change before it reaches Staging.

## Product areas

| Area | Grade | Code | Graded |
| --- | --- | --- | --- |
| Accounts and sessions | B | `functions/api/better-auth.ts`, `functions/api/utils/session.ts`, `functions/api/utils/auth-email.ts`, `functions/api/utils/auth-request-guard.ts`, `src/contexts/CloudflareAuthContext.tsx`, `src/contexts/sessionSync.ts`, `src/lib/auth/` | 2026-10-12 |
| Personal and Organization contexts | B | `functions/api/handlers/teams.ts`, `functions/api/utils/team-access.ts`, `src/contexts/WorkspaceProvider.tsx`, `src/lib/consoleRoutes.ts`, `src/lib/organizationPermissions.ts` | 2026-10-12 |
| Templates | B | `functions/api/handlers/template-create.ts`, `functions/api/handlers/template-update.ts`, `functions/api/handlers/template-reads.ts`, `src/views/TemplateDetail.tsx`, `src/views/TemplateEditor.tsx`, `src/components/template-editor/`, `src/features/template-editor/` | 2026-10-12 |
| Runs | B | `functions/api/handlers/checklists-update.ts`, `functions/api/handlers/checklists-shared.ts`, `functions/api/utils/run-provenance.ts`, `src/views/ChecklistRun.tsx`, `src/views/GuestRun.tsx`, `src/features/run-execution/`, `src/features/guest-runs/` | 2026-10-12 |
| Billing and plans | B | `functions/api/handlers/billing.ts`, `functions/api/handlers/stripe.ts`, `functions/api/utils/entitlements.ts`, `src/components/account/BillingSection.tsx`, `src/views/Pricing.tsx` | 2026-10-12 |
| Run Keys and MCP | B | `functions/api/handlers/agentMcp.ts`, `functions/api/handlers/agentMcpTools.ts`, `functions/api/handlers/agentMcpPages.ts`, `functions/api/handlers/agentMcpTemplates.ts`, `functions/api/handlers/agentMcpRuns.ts`, `functions/api/handlers/agent-keys.ts`, `src/components/account/AgentAccessSection.tsx` | 2026-10-12 |
| Public pages and SEO | A | `functions/sitemap/`, `functions/seo/`, `functions/api/handlers/profile-directory.ts`, `src/views/PublicTemplate.tsx`, `src/views/PublicProfile.tsx`, `src/views/ChecklistLibrary.tsx`, `src/lib/http/urlStandard.ts` | 2026-10-12 |
| Imports, exports and uploads | B | `functions/api/handlers/template-backup.ts`, `functions/api/handlers/uploads.ts`, `functions/api/handlers/clipy.ts`, `src/components/TemplateBackup.tsx`, `src/features/template-backup/` | 2026-10-12 |
| Design and phone layout | B | `src/components/ui/`, `src/components/layout/`, `src/app/globals.css` | 2026-10-12 |

- **Accounts and sessions, B.** Better Auth's setup, the request guard, rate limits, sessions and
  their sync across tabs are unit-tested (`tests/unit/functions/api/better-auth-config.test.ts`,
  `tests/unit/contexts/sessionSync.tabs.test.ts`), and twelve browser specs drive signing up, in
  and out, verification and expiry, `smoke-sign-in.spec.ts` among the smoke tests. Documented in
  [`authentication.md`](agents/authentication.md) and the [account](product/account.md) product
  doc. Main gap: email delivery is checked only by hand, nothing checks that the browser keeps no
  auth token, and an account can't be deleted in the product ([`tech-debt.md`](tech-debt.md),
  Accounts and email).
- **Personal and Organization contexts, B.** A unit test keeps the UI's role matrix equal to the
  API's, the console routes and their parser are unit-tested, and browser specs walk an
  Organization's routes, roles, invites and settings (`organization-routes.spec.ts`;
  `team-invite-flow.spec.ts` and `team-workspace.spec.ts` as smoke tests). Documented in
  [`organizations.md`](agents/organizations.md) and the [contexts](product/contexts.md) and
  [dashboard](product/dashboard.md) product docs. Main gap: the code still says team and workspace
  for an Organization (TD-5, a large rename), and nothing checks that other members see an
  Organization's avatar without its controls.
- **Templates, B.** Saves, versions, conflicts, visibility, transfer, Required tools and forms are
  unit-tested, transfer on local D1 too (`tests/integration/template-transfer-local-d1.test.ts`),
  the editor's components run in a real DOM, and 28 browser specs drive the editor, the detail
  page and the library, the editor at a phone width included (`template-editor-phone.spec.ts`).
  Documented in [`template-editor.md`](agents/template-editor.md),
  [`template-content-types.md`](agents/template-content-types.md) and the
  [Templates](product/templates.md) product doc. Main gap: three behaviors have no automated check
  (the confirmation before "Load latest version", the API copying only public Templates, and
  Required tools links kept as written), and Templates seeded before the seed fix still store
  escaped line breaks, which the display rewrites (TD-22).
- **Runs, B.** Reconciliation, saves and their revisions, sharing, provenance, form answers and
  guest runs are unit-tested, sharing, provenance and source access on local D1 too
  (`tests/integration/run-sharing-local-d1.test.ts`), and 18 browser specs drive the Run page,
  guest runs and shared runs. Documented in [`run-execution.md`](agents/run-execution.md) and the
  [Runs](product/runs.md) product doc. Main gap: a typed form answer still focused when the page
  closes is lost (TD-87), the web app has no Reopen action, and nothing checks that sharing a run
  again ends its previous link.
- **Billing and plans, B.** Checkout, the portal, the webhook's ordering and guards, entitlements
  and plan limits are unit-tested against stand-ins for Stripe
  (`tests/unit/functions/api/stripe-webhook-ordering.test.ts`), plan limits are raced on local D1
  (`tests/integration/plan-limits-concurrency-local-d1.test.ts`), and seven browser specs drive
  the upgrade offers, plan limits and the way back from Checkout, with Checkout stubbed
  (`template-limit.spec.ts`, `billing-back-from-checkout.spec.ts`). Documented in
  [`billing.md`](agents/billing.md) and
  [pricing and entitlements](product/pricing-and-entitlements.md). Main gap: nothing runs against
  Stripe itself, so a real Checkout, the portal and webhook delivery are checked by hand
  ([`billing.md`](agents/billing.md), Production verification).
- **Run Keys and MCP, B.** Every tool's arguments, permissions, result bound and pages are
  unit-tested (`tests/unit/functions/api/agent-mcp-result-bounds.test.ts`), local D1 tests drive
  Templates and Runs through a Run Key (`tests/integration/personal-run-mcp-local-d1.test.ts`), and
  `personal-run-mcp.spec.ts` drives a Run with a Run Key as a smoke test. Documented in
  [`agent-access.md`](agents/agent-access.md) and the [MCP release notes](product/mcp.md). Main
  gap: keys never expire, and nothing limits one key across isolates (TD-25, medium, with no issue
  yet, so not A).
- **Public pages and SEO, A.** Sitemaps, their cache and triggers, page metadata, the URL standard
  and the Profiles directory are unit-tested (`tests/unit/config/urlStandard.test.ts`),
  `smoke-sitemaps.spec.ts` and `site-standards.spec.ts` run on every pull request, and each deploy
  checks the new deployment against the site standards. Documented in
  [`seo-and-sitemaps.md`](agents/seo-and-sitemaps.md) and [`frontend.md`](agents/frontend.md),
  URLs. Main gap: how search engines read the site is checked by hand in Search Console, and
  `sitemap:check` runs nowhere, since squash merges rewrite the dates it compares.
- **Imports, exports and uploads, B.** Portable packs are generated from and checked against their
  schema, uploads' limits and byte ranges are tested, and browser specs drive import, export and
  uploads (`template-export.spec.ts`, `uploads-range.spec.ts`; `account-avatar.spec.ts` as a smoke
  test). Documented in [portable templates](product/portable-templates.md) and
  [`database-operations.md`](agents/database-operations.md), R2 uploads. Main gap: uploads have no
  per-account quota, no delete by their owner and no cleanup of orphans (TD-18 to TD-20).
- **Design and phone layout, B.** The shadcn components and layout blocks have DOM tests,
  `heading-outline.spec.ts` reads every page's headings, and 20 browser specs drive a page at a
  phone width of 390 pixels or less, the public menu, the Run's task list and the editor among
  them. Documented in [`design.md`](agents/design.md) and
  [`ui-screen-inventory.md`](agents/ui-screen-inventory.md). Main gap: the screens those specs
  don't open are checked at phone widths only by hand, and dark mode on every screen too, with
  screenshots.

## Layers

| Area | Grade | Code | Graded |
| --- | --- | --- | --- |
| Type safety | A | `tsconfig.json`, `tsconfig.node.json`, `functions/tsconfig.json`, `tests/tsconfig.json`, `tsconfig.declarations.json`, `scripts/lint.ts` | 2026-10-12 |
| Boundary parsing | A | `src/lib/schemas/`, `src/lib/api/request.ts`, `functions/api/utils/payloads.ts`, `scripts/eslint-rules/no-external-data-casts.ts` | 2026-10-12 |
| D1 cost | B | `functions/api/utils/d1-profiler.ts`, `scripts/d1-profile.ts`, `tests/integration/rows-read-budgets-local-d1.test.ts` | 2026-10-12 |
| Layers and dead code | B | `.dependency-cruiser.cjs`, `knip.json`, `.jscpd.json` | 2026-10-12 |
| Observability | B | `functions/api/utils/logger.ts`, `scripts/logs-query.ts` | 2026-10-12 |
| Delivery | B | `.github/workflows/ci.yml`, `.github/workflows/browser-tests.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`, `scripts/verify-deployment.ts`, `scripts/check-site-standards.ts`, `scripts/promote-prepare.ts` | 2026-10-12 |
| Repository checks and agent workflows | B | `scripts/checks/`, `tools/checks/`, `lefthook.yml`, `.claude/`, `.github/workflows/pull-request.yml`, `.github/workflows/code-review.yml`, `.github/workflows/claude.yml`, `.github/workflows/maintenance.yml`, `scripts/maintenance-report.ts` | 2026-10-12 |

- **Type safety, A.** `strict` and five stricter flags in every project, tests included, all in
  `pnpm run typecheck`; `tests/unit/config/typecheck-coverage.test.ts` fails when a project turns
  one off or a file escapes every project, and ESLint refuses `!` and unsafe assertions.
  Documented in [`code.md`](agents/code.md). Main gap: the generated `cloudflare-env.d.ts` is
  regenerated and compared (`pnpm run verify generated`) but type-checked only under
  `skipLibCheck`.
- **Boundary parsing, A.** Every API answer, Stripe reply, webhook body, stored JSON column and
  browser storage read is parsed with Zod, and `serplists/no-external-data-casts` and the
  type-aware `no-unsafe-*` rules refuse casts of outside data everywhere, tests included
  (`tests/unit/config/external-data-boundaries.test.ts`). Main gap: none known.
- **D1 cost, B.** Rows-read budgets for the hot requests run on local D1 on every pull request,
  and [`d1-cost.md`](agents/d1-cost.md) holds the query rules and the measurements. Main gap:
  `pnpm run d1:profile`, at full scale, runs only by hand, and Organization run lists and catalog
  misses still read in proportion to their tables (the D1 cost issue to come).
- **Layers and dead code, B.** dependency-cruiser holds a rule for every arrow `ARCHITECTURE.md`
  draws, with no baseline, and prints each rule's fix (`tests/unit/config/layer-rules.test.ts`);
  knip fails on unused files, exports and packages; each runs in `pnpm run verify`. Main gap:
  jscpd matches clones only within one format, so a block a `.ts` and a `.tsx` file share passes,
  and read as one format the code holds 6 clones ([`harness-debt.md`](harness-debt.md), Checks).
- **Observability, B.** The API logs structured JSON with request ids, and
  `pnpm run logs:query` answers errors, routes, latency and one request's timeline from the local
  and browser-test logs, with tests. Documented in [`observability.md`](agents/observability.md).
  `/api/health` and every page name the release, and the browser reports its errors to Workers
  Logs (ADR 0006). Main gap: reading Staging's or Production's logs (`pnpm run logs:deployed`)
  needs a read-only token an owner makes, and the browser's stacks are minified.
- **Delivery, B.** CI gates each deploy, which refuses pending migrations, probes the new
  deployment and checks it against the site standards, and the workflow tests hold the deploys to
  that (`tests/unit/workflows/deploy-workers.test.ts`). Documented in
  [`ci-deploys.md`](agents/ci-deploys.md). The smoke test checks the deployed commit and a refused
  sign-in, Production waits for a verified Staging deploy of the same files, a re-run of an old run
  deploys nothing, and a failed deploy opens an issue. Main gaps: these guards first run on GitHub
  after this merges, only `Quality Gate` is required until an admin requires the gate jobs and
  turns the merge queue on, and CI deploys with the account's global API key.
- **Repository checks and agent workflows, B.** `pnpm run verify` runs the comment, docs, size,
  secret, duplicate, dead-code, dependency, linter and generated-file checks, on all files or some, the git hooks run the fast ones, and the checks' own
  tests run in CI (`tests/unit/config/`, `tests/unit/scripts/`); the review, `@claude` and weekly
  maintenance workflows have outcome guards with tests (`tests/unit/workflows/`). Documented in
  [`code.md`](agents/code.md), [`checks.md`](agents/checks.md) and
  [`ci-agents.md`](agents/ci-agents.md). The edit and stop hooks check an agent's files as it
  writes them and before its turn ends. Main gap: the rewritten review, `@claude` and gardening
  workflows haven't run on GitHub yet, and the review is skipped on pull requests into `staging`
  until its workflow reaches `main`.

Re-grade an area, and set its Graded date to that day, in the same pull request that changes its
tests, CI or docs, even when its grade stays the same.
