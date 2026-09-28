# Tech Debt Tracker

Known shortcuts and gaps, in one place. Pay these down in small PRs; the weekly
[maintenance report](../design-docs/agent-workflow.md#weekly-maintenance) counts open rows. When you close an
item, delete its row and mention the ID in the PR. When you take a shortcut, add a row.

"Ratchet" means the debt is recorded in a baseline file and new instances fail CI.

| ID | Area | Debt | Next step | Ratchet |
| --- | --- | --- | --- | --- |
| TD-1 | Types | `tests/` is not type-checked (about 460 errors under `strict`). | Add a tsconfig for `tests/` to the `tsc -b` references and fix one directory at a time. | None |
| TD-2 | Boundaries | `src/lib/api.ts` returns `response.json()` as the declared type without parsing, so client code trusts guessed shapes. | Let the request helper take an optional Zod schema; convert template and run endpoints first. | None |
| TD-3 | Boundaries | API payload schemas accept `sections`/`items` as `z.unknown()` and normalize them by hand. | Parse with the shared checklist schemas in `src/lib/schemas/`. | None |
| TD-5 | Vocabulary | Code identifiers, tables, and routes still use `team`/`team_id`/`workspace` for Organization ([ADR 0001](../design-docs/personal-and-organization-contexts.md)). | Rename in separately scoped, migration-safe changes. | None |
| TD-6 | Architecture | 9 pages/components call `src/lib/api.ts` directly. | Continue the [UI decoupling plan](active/ui-decoupling.md). | `.dependency-cruiser-known-violations.json` |
| TD-8 | Size | 15 files exceed 500 lines; the API handlers are the largest (`templates.ts` about 1,600 lines). | Split handlers by route family into modules under `functions/api/handlers/`; lower caps. | `eslint.config.js` caps |
| TD-9 | Tests | `tests/integration/api.test.ts` targets legacy JWT endpoints through Wrangler's deprecated `unstable_dev` and is always skipped (28 tests). | Delete it or port the cases to `api.workerless.test.ts`. | None |
| TD-10 | Auth UX | A redirect-to-login-on-401 behavior (commit c7f2029) was added only to the legacy API client, which nothing imported; that client is now removed. | Decide whether `src/lib/api.ts` should redirect on 401 and add a test. | None |
| TD-11 | Tests | All e2e specs share one database and one set of seeded users, so they interfere when run in parallel (publishing specs move sitemap `lastmod` values; heavy parallel load slows page reloads past the 5-second expect timeout). `test:e2e:full` runs with one worker to stay deterministic (about 2 minutes). | Give each spec its own users and data (or per-worker D1 state) so the full suite can run in parallel. | `test:e2e:full` in CI on promotions |
| TD-12 | Tooling | No code formatter. Deferred on purpose: a repo-wide reformat would bury real changes in review. | Add Prettier in its own PR, format once, and list that commit in `.git-blame-ignore-revs`. | None |
| TD-13 | Architecture | `src/components/ui/file-upload.tsx` reads the auth context, so it is not a pure primitive. | Pass the user in as a prop, or move it to `src/components/shared/`. | `.dependency-cruiser-known-violations.json` |
| TD-14 | Database | Drizzle snapshot initialization is not done; `pnpm run db:generate` proposes a baseline that must not be committed. | Initialize snapshots as their own change, following the operations playbook. | None |
| TD-15 | D1 cost | `GET /api/templates` with no `scope` or `teamId` still returns public OR the user's Templates (19k rows read at 20k templates, uncached) for browser tabs loaded before the scoped client shipped. | After a release cycle, make the no-parameter request return the public catalog and delete the branch in `functions/api/handlers/templates.ts`. | None |
| TD-16 | D1 cost | Audit rows written before audit compaction still hold up to three full copies of run or template content in `before_json`/`after_json`/`diff_json` (history reads redact them). Run and template content itself has no size cap beyond the request body limit (2 MB for backup import). | A human-approved production cleanup that nulls `before_json`/`after_json` and compacts `diff_json` on old `checklist_run.*` and `template.*` rows; decide a product limit for content size and return `413` above it. | None |
