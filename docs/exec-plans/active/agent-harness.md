# Agent Harness

- **Status:** active
- **Last updated:** 2026-09-27
- **Goal:** make the repository legible and self-checking for coding agents, following
  OpenAI's "harness engineering" practices: a short map in AGENTS.md, repository
  knowledge as the system of record, mechanically enforced invariants, an app agents
  can boot and observe, and continuous cleanup.

## Progress

- [x] Real type checking: `tsc -b` over app, node, and API projects, all `strict`.
  The old `tsc --noEmit` checked 0 files; about 140 hidden errors were fixed.
- [x] CI runs every existing check that can be stable in CI (secret scan, schema and
  template artifacts, Drizzle parity), and deploys only after all of them pass.
- [x] Broken checks repaired: Drizzle parity was passing vacuously (Wrangler returned
  only the first result set), and the sitemap catalog was stale.
- [x] Deploy builds use full git history (sitemap `lastmod` was being set to the deploy
  date) and probe each new deployment.
- [x] Architecture rules (`deps:check`) and taste rules (ESLint), with remediation
  messages and shrink-only baselines.
- [x] Knowledge base in the guide's layout: AGENTS.md as the map, ARCHITECTURE.md,
  and `docs/` with design-docs (catalogued with status), exec-plans, generated
  (db schema), product-specs, vendored references, and the DESIGN, FRONTEND, PLANS,
  PRODUCT_SENSE, QUALITY_SCORE, RELIABILITY, and SECURITY guides. `docs:check`
  enforces the layout in CI.
- [x] App legibility: `pnpm run setup` for any worktree, dev logs in `tmp/logs/`,
  `pnpm run ui:snap`, Playwright failure evidence uploaded from CI.
- [x] Continuous cleanup: weekly maintenance report posted as a `ready-for-agent` issue.
- [x] Full e2e suite runnable through the isolated stack and required on promotions;
  stale specs fixed. All 38 specs pass serially (TD-11 covers parallel isolation).
- [x] Dead code removed: 18 unreachable modules deleted; the reachability rule keeps
  new dead code out.
- [x] Product vocabulary: all user-visible Team/Workspace copy (UI and API error
  messages) replaced with glossary terms; the ESLint rule has no suppressions left.
- [ ] Admin settings: required status checks, auto-merge, and agent code review
  (see [agent workflow](../../design-docs/agent-workflow.md#repository-settings-admin-only)).
- [ ] Burn down the tracked debt: TD-1 (tests `strict`) and TD-2 (parse client
  responses) first.

## Decision log

- 2026-09-27: Turned on `strict` everywhere instead of baselining type errors. Strict
  mode added only a handful of errors beyond the ~135 that already existed, so fixing
  them once was cheaper than maintaining a ratchet. `tests/` stays out for now (TD-1).
- 2026-09-27: Existing violations are recorded in tool-native baselines (ESLint bulk
  suppressions, dependency-cruiser known violations) rather than rule exemptions, so
  new code is held to the rule and the debt can only shrink.
- 2026-09-27: Oversized files get per-file caps at their current size instead of a
  suppression, because a suppressed `max-lines` would let those files keep growing.
- 2026-09-27: The vocabulary rule flags capitalized Team/Workspace and lowercase
  "workspace" in prose, but not lowercase "team", which is ordinary English in
  marketing copy.
- 2026-09-27: Existing Team/Workspace copy was suppressed rather than rewritten,
  because the replacement wording for the context switcher is a product decision (TD-4).
- 2026-09-27: The deploy workflow became a reusable workflow called by CI after the
  checks, instead of a `workflow_run` trigger, which would change `github.ref_name`
  semantics for the existing staging and production conditions.
- 2026-09-27: Local observability is a log file per dev session plus `grep`, not a
  LogQL/PromQL stack. That is proportionate for a codebase of this size.
- 2026-09-27: The weekly cleanup is a deterministic report posted as a
  `ready-for-agent` issue, so it fits the existing triage flow without new API keys.
- 2026-09-27: Full e2e runs only on promotions to `main` (smoke tests run on every
  PR), keeping merge gates light while still exercising every spec before production.
- 2026-09-27: The full e2e suite runs with one worker. In parallel, specs that publish
  templates change sitemap `lastmod` values and run data under other specs (they share
  one database); serially all 36 pass in about 2 minutes. Per-spec data isolation is TD-11.
- 2026-09-27: `sitemap:check` stays out of CI. The catalog's `lastmod` values come from
  commit dates, which squash merges rewrite, so a committed copy is stale by
  construction after merge. Every build regenerates it from full history instead.
- 2026-09-27: No code formatter yet (TD-12): a repo-wide reformat would bury these
  changes in review. It belongs in its own PR.
- 2026-09-27: Removing 17 unreachable modules was deferred for human confirmation;
  the reachability rule keeps new dead code out in the meantime (TD-7).
- 2026-09-27: Dead-module deletion approved and done (supersedes the deferral above).
- 2026-09-27: Vocabulary replacement done (supersedes the TD-4 deferral). Wording: the
  switcher is "Switch context" (the ADR calls these ownership contexts), the paid
  Organization plan label is "Paid" (plans.md calls it a paid Organization), and
  Personal and Organization are capitalized as context names. Recorded in the glossary
  (now `docs/PRODUCT_SENSE.md`).
- 2026-09-27: The two `fixme` e2e tests were investigated with the harness and are
  valid: both pass when run on their own and in the serial full suite. They failed
  only under parallel load, so `fixme` was removed. The earlier guess that the view
  toggle lacked an accessible name was wrong; `ui:snap` showed the name is present.
- 2026-09-27: Restructured `docs/` to the guide's layout exactly. The root glossary
  (`CONTEXT.md`) became `docs/PRODUCT_SENSE.md`; 62 scattered docs (getting-started,
  knowledge, modules, operations, patterns, recipes, reference, schema, adr, agents)
  were merged into 36, with runbooks folded into RELIABILITY/SECURITY and subsystem
  docs into design-docs. `docs:check` now rejects files outside the layout,
  uncatalogued design docs, and extra root documents, so the sprawl cannot return.
- 2026-09-27: Hand-maintained inventories (file inventory, tech stack, schema snapshot
  notes) were replaced by the ARCHITECTURE.md map and a generated
  `docs/generated/db-schema.md`, checked in CI. Third-party docs are vendored in
  `docs/references/` (refresh with `pnpm run docs:references`); Zod's site is not,
  because it documents v4 and we pin v3.
