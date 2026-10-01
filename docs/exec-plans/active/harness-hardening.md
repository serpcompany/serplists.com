# Harness hardening

Last updated: 2026-10-01

## Goal

Enforce, mechanically, every verification OpenAI's harness engineering write-up recommends
for an agent-written codebase, allow no exceptions (file-size caps, lint suppressions,
dependency baselines, skipped tests) without an extremely good reason recorded here, and
allow no code comments: code is structured, named and documented so that it needs none.

## Sources

- OpenAI, "Harness engineering: leveraging Codex in an agent-first world" (2026-02-11).
- The owner's rules (2026-09-30): no exceptions for line counts and the like, and no code
  comments at all, enforced by checks.

## Gap analysis (2026-09-30)

| Practice | Before | Plan |
| --- | --- | --- |
| Custom lints with fix-it messages; layered dependency rules; docs structure, links and freshness checks; AGENTS.md as a map; exec plans; per-worktree app; Chrome DevTools, snapshots and video; agent review on every push | In place | Keep |
| File-size limit (500 lines) | 8 files exempt, 3,120 lines over | Split them; delete the exemption list |
| Dependency rules | 5 known violations baselined | Fix them; delete the baseline |
| Lint suppressions | 4 suppressed errors, 2 `eslint-disable` lines | Fix them; delete the mechanism |
| Skipped tests | 28, behind `RUN_WRANGLER_INTEGRATION` | Run them in a suite, or remove what other suites cover |
| "Prefer shared utilities" | `jscpd` installed, never run | Run it in `check:repo`; remove clones |
| Naming conventions | None | Lint them |
| Validate at boundaries | Policy only | Lint unvalidated casts of external data |
| Dead code | None | `knip` in `check:repo` |
| Stricter types | `strict` only | Enable `noUncheckedIndexedAccess` and related flags |
| Quality grades on a cadence | Manual | The weekly doc gardener re-grades changed rows |
| Background refactoring PRs | Weekly report issue | A weekly code-gardening job: one small debt fix per PR |
| Agents act on review feedback | Manual | An `@claude` workflow that addresses review comments |
| Logs, metrics and traces an agent can query | `grep` over JSON logs | A query tool over the structured logs: filters, per-route latency, per-request timeline |
| Type-checked tests | No tsconfig includes `tests/`: 685 errors in 86 files under `strict` (TD-1) | A tests tsconfig in `pnpm run typecheck`; fix the errors |
| File-size limit everywhere | `max-lines` checks only `src/` and `functions/`: 25 files in `tests/`, one in `scripts/` and one in `db/` are over 500 lines | `max-lines` on every authored file; split them |
| Rule overrides | `@next/next/no-img-element` off for 3 files; `no-explicit-any` and `no-this-alias` off in tests; react-refresh off for `ui`, contexts, `app` and tests; the reachability rule exempts `src/components/ui/`, `use-mobile.tsx` and `securityHeaders.ts` | Remove each one, or record here why it must stay |
| Performance checks | A ported test timed the catalog against a 1-second wall clock, which flakes on a loaded runner; removed | Rows-read budgets for the hot routes, measured with `withD1Profiling` in the router test |
| No code comments | 7,996 comments in 1,080 files, plus `.dev.vars.example`, `.gitignore`, `.gitattributes` and `.npmrc` | A lint rule and a repository check; remove them all, moving what they knew into docs, names and tests |

## Phases

1. [x] No exceptions: split the 8 oversized files, fix the suppressions, dependency
   violations, directives and skipped tests, delete the exception mechanisms, and add a
   check that they stay gone.
2. [x] Comment enforcement tooling: the ESLint rule and the check for other file types,
   with tests; size the new verifications in report mode.
3. [x] Remove every comment, area by area, moving what each one knew into the doc that owns
   the area, a name, or a test; then enable the comment checks.
4. [ ] New verifications: a tests tsconfig, then `max-lines` on every authored file, naming
   conventions, boundary validation, duplicates, dead code, stricter types and rows-read
   budgets; audit the rule overrides; fix what each finds, then enforce it.
5. [ ] Agent loops: code gardening, quality re-grading, `@claude` feedback. They were proven in
   the sandbox repository, but not adopted: Claude Code's safety check refused to add
   workflows that run Claude with write access to the repository.
6. [x] Observability: the log query tool and its skill. Follow-up: `d1_query` lines carry
   their request id, so a request's timeline and the route table show rows read.
7. [x] Docs, `pnpm run verify`, and the full browser suite (2026-10-01: verify, 68 local-D1
   tests, and 270 browser tests on a fresh production build).

## Sizing (2026-09-30)

Measured in report mode, with nothing enforced. Phases 3 and 4 work from these numbers.

- **Comments:**
  - By language: 7,746 in TS and JS (7,050 line, 672 JSDoc and 24 block comments), 116 in
    SQL, 76 in YAML, 32 on the lines `patches/wrangler@4.143.0.patch` adds, 13 in TOML,
    8 in workflow `run:` blocks, 4 in tsconfig JSON and 1 in CSS.
  - By area: `tests/` 3,189, `src/` 2,922, `functions/` 1,142, `scripts/` 355, `db/` 130,
    root config files 92 and workflows 82.
- **Naming** (`@typescript-eslint/naming-convention`): 31 violations.
  - 18 are snake_case Drizzle table exports in `db/schema`.
  - 11 are UPPER_CASE constants declared inside functions.
  - `personal_run_keys` is a parameter, and `Geist_Mono` is the test stand-in for the
    `next/font` export.
  - Object and type properties stay unchecked: they mirror D1 columns, JSON fields and MCP
    tool names.
- **Boundary validation:** `no-restricted-syntax` reports casts of `JSON.parse`, `.json()`,
  `getItem()` and `event.data`, plus `as unknown as`. It finds 265 hits, 70 of them in
  runtime code.
  - The runtime casts of external data are the Stripe webhook body, the shared API client's
    `response.json()` (behind 55 request methods), the auth client and the schema doc
    generator.
  - 55 of the 61 double casts in `functions/` widen D1 rows to `Record<string, unknown>`.
  - The type-aware `no-unsafe-*` rules add 34 hits in `src/` and `functions/`.
- **Duplicates** (jscpd at its defaults, 50 tokens and 5 lines): 33 clones in `src/` and
  `functions/`, 5 in `scripts/` and `db/`, 489 in `tests/`, and 10 in `db/migrations`.
  `sre:dup` ends in `|| true`, so it never fails.
- **Dead code** (knip 6, with the entry points tools load by convention configured):
  - 13 unused files: `db/types/*` and `src/components/ui/scroll-area.tsx`.
  - Unused packages: 2 dependencies (`@uiw/react-md-editor`, `jszip`) and 4 devDependencies.
  - 2 unlisted packages: `@opennextjs/aws` and `yaml`.
  - 185 unused exports and 49 unused types.
  - 1 duplicate export: `MAX_PASSWORD_BYTES` and `MAX_PASSWORD_LENGTH`.
- **Stricter types**, in the order to enable them:

  | Flag | New errors |
  | --- | --- |
  | `noImplicitOverride` | 10 |
  | `noFallthroughCasesInSwitch` | 0 |
  | `exactOptionalPropertyTypes` | 195 |
  | `noUncheckedIndexedAccess` | 151 |
  | `noPropertyAccessFromIndexSignature` | 923 |

  The last flag's errors are mostly dot access on `Record<string, unknown>` rows. Typing
  those rows fixes them and the double casts together.

## Phase 3 method

For each comment, its knowledge goes to exactly one place:
- **nowhere**, when it restates the code;
- **a name**: a rename, an extracted function or a type;
- **a test** named for the behavior and its reason;
- **the doc that owns the area**, written by topic;
- **the tech debt tracker**.

Rules for the agents:
- Never move comment text into strings, constants or log lines.
- Behavior does not change, and external contracts (HTTP API, D1, MCP, URLs, stored JSON) keep
  their names.

Scheduling:
- Two agents work at a time, in disjoint areas. Each pair is one app area beside one test area, so
  they never edit the same docs or tests.
- `pnpm run verify` runs between pairs.
- The ESLint rule and `comments:check` are enforced once every area is clean.

| Pair | App area | Test area |
| --- | --- | --- |
| 1 | `functions/api/handlers` and top-level `functions/api` files | `tests/unit/components` |
| 2 | `functions/api/utils`, `functions/sitemap`, `functions/seo` | `tests/unit/features`, `tests/unit/hooks` |
| 3 | top-level `src/lib` files and `src/lib/{schemas,http,api,forms}` | first half of `tests/e2e` |
| 4 | the rest of `src/lib`, `src/types`, `src/utils`, `src/data`, `src/server` | second half of `tests/e2e`, `tests/unit/e2e` |
| 5 | `src/features`, `src/hooks` | first half of `tests/unit/functions` |
| 6 | `src/contexts`, `src/views`, `src/app` | second half of `tests/unit/functions`, `tests/integration`, `tests/unit/{db,server,seo,security}` |
| 7 | `src/components/{layout,template-editor,run-execution,ui}` | `tests/unit/views`, `tests/unit/contexts` |
| 8 | the rest of `src/components` | `tests/unit/lib`, `tests/support`, `tests/fixtures`, the rest of `tests/` |
| 9 | `scripts`, `tests/unit/{scripts,config,workflows}` | none |
| 10 | root config, `db`, `.github`, Lefthook, Wrangler, tsconfig JSON, CSS, patches, and dotfiles; the check covers every tracked format | none |

## Phase 4 schedule

This runs on branch `fl/harness-checks`, stacked on PR #260, and works through issue #259.

Each round pairs a test-side item with an app-side item, so the two agents mostly touch
different files. Each item ends with its check enforced in `pnpm run verify`.

| Round | Test side | App side |
| --- | --- | --- |
| 1 | Type-check the tests (TD-1) | `noImplicitOverride`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` on app code |
| 2 | `max-lines` on `tests/`, `scripts/`, `db/` | Boundary validation lint, and the API client parses with Zod (TD-2) |
| 3 | Duplicate code in tests (TD-46, TD-47) | `noPropertyAccessFromIndexSignature`, typed D1 rows |
| 4 | Tests that read source text; rows-read budgets | Naming conventions, including the Drizzle table exports |
| 5 | Small tracker fixes (TD-33 to TD-44, TD-48, TD-49) | Duplicate code in app code (TD-30 to TD-32, TD-35, TD-38, TD-41); rule override audit |
| 6 | Dead code (`knip`; TD-37, TD-39); the round 1 flags extended to tests; the full browser suite | |

## Exceptions allowed

- **Generated files:** `cloudflare-env.d.ts`, `next-env.d.ts`, `pnpm-lock.yaml`,
  `docs/generated/` and the rest of `GENERATED_FILES` in `scripts/check-no-comments-lib.mjs`.
  They are not authored code: a generator rewrites them, so the checks skip them.
- **`db/migrations`** is left out of the duplicate check.
  - Applied migrations are append-only history and cannot be edited to share code.
  - A migration that rebuilds a table has to restate the whole table.
- **Two CI workflows keep their comments:** `.github/workflows/claude-code-review.yml` and
  `maintenance.yml`, listed in `WORKFLOWS_AWAITING_A_PERSON`.
  - Claude Code's safety check refused an agent's edit to them, so a person has to remove the
    comments.
  - A test fails once either file is clean, so the list can only shrink.
- **knip's ignore lists:**
  - `@secretlint/secretlint-rule-preset-recommend`, which secretlint loads by name from
    `.secretlintrc.json`.
  - The `stripe` binary: the Stripe CLI, installed outside npm.

## Progress

- 2026-09-30: gap analysis; phases 1 and 2 started.
- 2026-09-30: phase 1 done. No exception mechanism is left, and a test fails if one comes back.
  - Directives: the template editor's two `eslint-disable` lines went with its duplicate save
    helpers, now imported from its model (bbb7815c).
  - Dependency baseline: the five screens call the API through features (94d6b0a6). The
    baseline file, `--ignore-known` and `deps:baseline` are gone (d8c57803).
  - Skipped tests: 23 of the 28 run through the router on a real local D1 in
    `pnpm run test:local-d1` (6e97803b), rewritten for the Better Auth routes that replaced
    register, login and profile. The other 5 were already covered: unauthenticated template
    create and run list (the handler tests), the CORS preflight and health check
    (`api.workerless.test.ts`), and an unknown route (`router-method-exports.test.ts`).
    Porting them found that a sign-up without a password answered 500; it answers 400 now
    (091c6cb1). They also showed that Node's fetch cancels a request's body when a clone of
    it is garbage collected, which made the router's body count flaky in Node; the test sends
    Content-Length, as clients do, and the hazard is TD-29 (fc4e6bdc; its message says TD-27,
    an ID an earlier, closed item already had).
  - Suppressions: the file and the pre-commit flag that let unpruned suppressions pass are
    gone (9516e451).
  - File size: the 8 capped files and the sidebar primitive are split by responsibility
    (25ef1577, d7a86614, e7e83ddd, f879002b, 15d22f4f, 54cbb9b8, df24fe48, eac27491,
    ba69768b). Every source file in `src/` and `functions/` is held to 500 lines,
    `src/components/ui/` and tests beside the code included (91cb6e0a).
  - Guards: `tests/unit/config/no-exceptions.test.ts` and ESLint rules on test files
    (8ecb8a20), described in the [core beliefs](../../design-docs/core-beliefs.md#no-exceptions).
- 2026-09-30: phase 2 done. The no-comments ESLint rule (18e4dcd2) and the check for YAML,
  TOML, SQL, CSS, JSON and patches (64516b84) have 34 tests. The sizing is above.
- 2026-09-30: phase 5 proven in the sandbox repository (PRs #9 to #12 there).
  - The loops: `@claude` fixes a review finding and the next review marks it fixed, a
    weekly code gardener opens one small debt fix, and the doc gardener re-grades stale
    QUALITY_SCORE rows.
  - Fixes it found for the existing workflows: the review must allow `claude[bot]` and edit
    its summary by id, and the attribution setting takes strings, so `false` was ignored.
  - The port into this repository waits for the owner's approval of the workflow changes.
- 2026-10-01: phase 3, pairs 1 and 2 done; `pnpm run verify` passed at 47d31be4.
  - `functions/api/handlers` and the top-level API files: 554 comments (39ba09e5..93ac5f6f).
    New doc: [agent access](../../design-docs/agent-access.md).
  - `tests/unit/components`: 351 comments (ce4ab433..47d31be4). Shared test helpers moved
    to `tests/support/`.
  - `functions/api/utils`, `functions/sitemap`, `functions/seo`: 588 comments (4f885527..d2745713).
    New doc: [SEO and sitemaps](../../design-docs/seo-and-sitemaps.md). Two docs that
    described the code wrongly were corrected. Its auth commit landed inside 29af3457,
    under that commit's test message.
  - `tests/unit/features`, `tests/unit/hooks`: 326 comments (d70122d8..cefac098).
- 2026-10-01: phase 3, all of `src/`, `functions/` and most of `tests/` are comment-free.
  - `pnpm run verify` passed at every pair boundary, most recently at ebf04fb8 (5,601 tests).
  - The no-comments rule is enforced on `src/` and `functions/` (9eb2ea39) and on the
    cleaned test folders (45fbd5ce), with `noInlineConfig`.
  - New design docs:
    - [client data](../../design-docs/client-data.md);
    - [template editor](../../design-docs/template-editor.md);
    - [run execution](../../design-docs/run-execution.md).
  - Agents also added tests, in most cases checking each one fails when the code it guards
    is broken.
  - They replaced copied test helpers with shared ones in `tests/support/`.
  - Two unit checks read marker comments in browser specs; they now use a `no-such-` slug
    convention and a named fetch helper.
  - Duplication and dead code that the checks below do not cover went into the tracker as
    TD-30 to TD-47.
  - Left: `scripts/`, the views, contexts, server and SEO tests, the root config, `db/`,
    the other formats, and the files that wait for the phase 5 port.
- 2026-10-01: phase 3 done.
  - Every file is comment-free except the two workflows above.
  - ESLint's no-comments rule covers every JS and TS file, with `noInlineConfig`.
  - `comments:check` covers YAML, TOML, SQL, CSS, JSON, XML, patches and the dotfiles, and
    runs in `check:repo` and the Lefthook pre-commit hook.
  - A coverage test fails on any tracked format neither check reads.
- 2026-10-01: staging deploys to its Worker (`deploy-staging.yml`) on a push to `staging` that
  passes CI, replacing the disconnected Pages deploy. Staging lives on
  `https://serp-checklists-preview.serpcompany.workers.dev` until its domain moves.
- 2026-10-01: phase 4 and the other leftovers are tracked in issue #259 for the next PR.
- 2026-10-01: phase 4, test side of rounds 1 to 3 done.
  - Round 1: `tests/tsconfig.json` runs in `pnpm run typecheck`, and the 684 errors are fixed,
    mostly by parsing responses with `readJson(response, schema)` (0693ffd6..2d03656a). TD-1
    is closed. The four round 1 flags stay off for tests until round 6.
  - Round 2: `max-lines` (500) covers every authored JavaScript and TypeScript file. The 25
    files over it in `tests/`, `scripts/` and `db/` are split by responsibility
    (c381e4e2..488ac205).
  - Round 3: `pnpm run duplicates:check` runs jscpd at its defaults with a threshold of 0 in
    `check:repo`, over `tests/` for now (75daa219..c133b31d).
    - The 519 clones (5,273 lines) are gone. 49 shared modules in `tests/support`,
      `tests/fixtures` and `tests/e2e/support` replace them. TD-46 and TD-47 are closed.
    - Every test name is unchanged, except two seed checks that checked nothing the kept
      check doesn't and the bundled-pack test, which moved.
    - jscpd has no tokenizer for XSD, so it does not read the two official sitemaps.org
      schemas in `tests/fixtures/`. The guard test fails on any other file it skips.
- 2026-10-01: phase 4, app side of round 1 done (4db83dbc..61a9e2b5).
  - The app, API and scripts tsconfigs turn on `noImplicitOverride`,
    `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes` and
    `noUncheckedIndexedAccess`.
  - It fixed 10, 0, 197 and 146 errors, with no casts or `!` added and two casts removed.
  - `prop?: T | undefined` appears only where callers really pass `undefined`, such as Zod
    output, form values or a deliberate clear. Values bound for JSON, logs or R2 metadata
    leave the key out instead.
  - The production build passes with them. The tests get them in round 6.
  - New tracker rows: TD-58 (`!` assertions), TD-59 (two casts left for the boundary
    round) and TD-60 (two small duplicates).
- 2026-10-01: phase 4, test side of round 4 done (65759f04..240dd819).
  - Rows-read budgets: `tests/integration/rows-read-budgets-local-d1.test.ts` runs in
    `test:local-d1`, so CI's D1 integration step enforces it.
    - It covers 37 hot requests over 400 templates and 800 runs.
    - A bounded request gets a constant budget. A request that is unbounded by design today
      gets a budget that grows with the rows it must read.
    - Dropping an index or a LIMIT on a scratch copy failed the matching tests.
  - Tests check behavior, not source text. 53 reads of `src/` and `functions/` in 38 test
    files are gone, and `serplists/no-source-text-reads` refuses new ones.
    - The properties those tests scanned for became lint rules: `serplists/restricted-code`,
      with its table in `scripts/eslint-rules/code-conventions.mjs`, and
      `serplists/navigate-while-visit-is-current`.
    - The rest became tests that render, call or request the code.
  - Rate limiting is deny-by-default (e60aa426). A route family added to the router is
    limited from its first request.
  - New tracker rows: TD-54 to TD-57. They cover what the new rules don't yet:
    - a registered audit action that nothing writes;
    - redirects inside `.then()`;
    - `wrangler.toml` read with regular expressions;
    - two checks that still read browser specs' text.
- 2026-09-30: phase 6 done.
  - `pnpm run logs:query` (5bffc6aa) reads the `dev:all` log and the browser tests' server
    log, which is new: `tmp/logs/e2e-server.log`. Before, Playwright discarded the API lines
    of a browser test run.
  - It answers grouped errors, requests per route with 4xx and 5xx counts and p50, p95 and
    max latency, the slowest requests, one request's timeline, and D1 statements by rows
    read, with `--json` for agents.
  - The debug-api skill, AGENTS.md, RELIABILITY and the development environment point to
    it (6a169adb).
  - Checked on a real browser test run: 15 smoke tests, and the log's route table read
    back from it.

## Decision log

- 2026-09-30: remove the exception mechanisms instead of shrinking them over time. The
  owner asked for no exceptions without an extremely valid reason.
- 2026-09-30: no code comments, in every language the repository writes. Knowledge a
  comment held moves to the doc that owns the area, a better name, or a test named for the
  behavior.
- 2026-09-30: comments in `.dev.vars.example`, `.gitignore`, `.gitattributes` and `.npmrc`
  count too. The check covers those formats, and what they explain moves into the docs.
- 2026-09-30: rename the 18 Drizzle table exports to camelCase rather than allowing
  snake_case in `db/schema/`.
  - Drizzle's convention is a camelCase export with the SQL name as the first argument.
    The exception's only reason would have been the current names.
  - Rejected: an exception for `db/schema/**`.
- 2026-09-30: the duplicate check runs at jscpd's defaults (50 tokens, 5 lines) with a
  threshold of 0, over `src/`, `functions/`, `scripts/`, `db/` and `tests/`.
  - Raising the token count to clear the 489 test clones would be an exception. Shared
    fixtures and helpers fix them instead.
  - Rejected: 100 tokens, which leaves 83 clones.
- 2026-09-30: tests get their own tsconfig before the stricter flags are enabled, so the
  flags cover tests too.
- 2026-09-30: `caniuse-lite` has been a direct dependency since the first commit, with no
  recorded reason. Phase 4 removes it unless the build needs it, and records why if it does.
- 2026-09-30: the skipped API tests targeted the JWT endpoints Better Auth replaced, so their
  behaviors were ported to today's routes rather than revived as written.
- 2026-09-30: `max-lines` also covers `src/components/ui/` and tests next to the code. The
  shadcn primitives are code the repository owns and changes. Rejected: an exception for
  `src/components/ui/`.
- 2026-09-30: the README and preview renderers moved from `src/lib/templates` to
  `scripts/lib`. Only the template scripts use them, so in `src/` the reachability rule
  reported them as dead code.
- 2026-09-30: `src/lib/api.ts` stays the client's one entry (`api` and its types) and joins
  endpoint groups in `src/lib/api/`, so no caller or test mock changed. The transport rules
  in `.dependency-cruiser.cjs` cover the folder too.
- 2026-09-30: ESLint refuses `.only` only when it is called, so ESLint's `RuleTester` can
  still be wired to Vitest (`RuleTester.itOnly = it.only`).
- 2026-09-30: `max-lines` still checks only `src/` and `functions/`: 25 files in `tests/`, one
  in `scripts/` and one in `db/` are over 500 lines. Extending it is a new verification, left
  for phase 4.
- 2026-09-30: the ported "answers the template catalog within a second" test is removed. A
  wall-clock bound fails on a loaded runner, so it is a flaky test, not a performance check.
  Phase 4 replaces it with rows-read budgets, which are deterministic and match what D1 bills.
- 2026-10-01: agents sharing a checkout commit with `git commit -m <message> -- <paths>`
  (and `git add -N` for new files), not `git add` and then `git commit`.
  - The index is shared, so one agent's staged files went into another agent's commit.
  - Staging by explicit path alone does not prevent that.
- 2026-10-01: Phase 4's boundary-validation work includes two casts phase 3 found:
  `stripePostForm<T>` casts Stripe's reply, and `isShareLinkEvent` casts parsed audit metadata.
- 2026-10-01: `duplicates:check` names the folders it checks on the command line
  (`jscpd tests`), not as a `path` in `.jscpd.json`. jscpd resolves a configured path to an
  absolute one and globs it, and on Windows that glob matches no file, so the check passed
  while reading nothing. The guard test refuses a `path` setting.
- 2026-10-01: a convention the tests used to scan the source for is a lint rule entry in
  `scripts/eslint-rules/code-conventions.mjs`. An entry may name `owners`, the modules
  that implement the convention (the clipboard helper may touch the clipboard), as
  ESLint's `ignores` already did for `browserStorage.ts` and the logger. That is the
  rule's definition, not an exception.
  - The `useTemplateLibrary` entry's owners are the pages that have loading and failure
    tests. A new page joins once it has them.
- 2026-10-01: `routeRateLimitBucket` counts every state-changing request as a write unless
  its route is exempt. Before, the router's source was read by a test to check that each
  family was listed. Existing routes are limited as before, and a write to a path no
  handler serves now counts too.
- 2026-09-30: the Node clone hazard is TD-29, not TD-27. TD-27 and TD-28 were the MCP result
  bounds, closed earlier. The tracker now keeps a next-ID line, so a closed ID is never
  reused.
