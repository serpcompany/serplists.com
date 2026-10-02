# Harness hardening

Last updated: 2026-10-02

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
4. [x] New verifications: a tests tsconfig, then `max-lines` on every authored file, naming
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
  - 13 unused files: `db/types/*` and the UI kit's scroll area (deleted in round 5).
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
  `docs/generated/` and the rest of `GENERATED_FILES` in `scripts/check-no-comments-lib.ts`.
  They are not authored code: a generator rewrites them, so the checks skip them.
- **`db/migrations`** is left out of the duplicate check.
  - Applied migrations are append-only history and cannot be edited to share code.
  - A migration that rebuilds a table has to restate the whole table.
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
- 2026-10-02: CI's lint ran out of memory: the four TypeScript projects in one ESLint process
  needed over 3 GB of heap, more than Node's default limit on the runner. `scripts/lint.ts`
  now runs ESLint once per area with that area's one project, and each run fits in 2 GB.
  Typed by its own project, the API showed two body readers taking the Workers types'
  untyped chunks; they now share one reader that narrows each chunk to bytes.
- 2026-10-02: no comments anywhere. The Claude review and weekly maintenance workflows are
  comment-free, and `WORKFLOWS_AWAITING_A_PERSON` is gone, so `comments:check` skips no
  file.
  - It also reads Markdown's HTML comments, outside code. The PR template's hints are
    visible text, and the generated schema doc's header is a sentence.
  - AGENTS.md has no `next dev` markers: `agentRules: false` in `next.config.ts` stops
    `next dev` from writing its block, with its HTML comment markers, back into AGENTS.md.
- 2026-10-02: phase 4 done.
  - The full browser suite ran on a fresh production build: 269 of 270 passed. The one
    failure was a stale mocked reply in `team-settings-conflicts.spec.ts`, which the client
    now correctly refuses. Its mock is built through the client's schema now (cbc52c08),
    and the spec's 7 tests pass.
  - `pnpm run verify` passed on a clean copy at 9f40df4f.
- 2026-10-02: the build and the browser tests moved out of CI into
  `.github/workflows/browser-tests.yml`, which runs only on pull requests into `main` and
  `staging`, on `ubuntu-latest`. It runs smoke tests on PRs into `staging` and the full
  suite on PRs into `main`. CI keeps `verify`'s checks, the local D1 tests and schema
  parity on every push. `tests/unit/workflows/browser-tests.test.ts` holds both workflows
  to that.
- 2026-10-02: TD-78 to TD-80 closed (624c187a..62f08e8c).
  - `downloadBackupFile` takes only the portable pack.
  - `normalizeSections` leaves out a legacy numeric Sub-task id instead of turning it into
    text. Run reconciliation pairs a numeric id by position. A run saved with `"7"` would
    stop pairing, and its ticked Sub-task would come back unticked after the next
    Template edit. A test now covers that path.
  - Bug fixed: MCP `set_subtask_completed` compared a stored numeric id with the string it
    was given, so it never found a legacy Sub-task (49bace1b).
  - `pnpm run verify` passed on a clean copy at 9f40df4f: 5,979 tests.
- 2026-10-01: phase 4, the last small items (c1cf8a0d..e04d8855). TD-29, TD-70 to TD-75 and
  TD-77 are closed.
  - Bugs fixed:
    - A guest save on a shared run copied one id-less Sub-task's completion onto
      another, when the stored run held entries the page drops (c1cf8a0d).
    - In Node, a request body without Content-Length became unusable once its clone was
      garbage-collected. The router now reads the body once (68c500e3).
    - Profile cards dropped a Template's type, so a recipe showed the checklist icon
      (4de7279e).
  - Simplifications:
    - one API Template mapper;
    - one owner-access helper;
    - content ids are strings;
    - three unreachable guards removed.
  - `tsconfig.declarations.json` type-checks the repository's own declaration files with
    `skipLibCheck` off, in `pnpm run typecheck`.
  - DOM tests use the real Base UI overlays and wait for them to close. 22 repeated runs
    of the affected files had no flakes.
  - New tracker rows:
    - TD-79: Sub-task ids;
    - TD-80: the generated env declarations;
    - TD-81: a dialog close button that needs the owner.
- 2026-10-01: phase 4, dead code (dd14418b..49366e5a).
  - `deadcode:check` runs knip in `check:repo` and takes about 3 s.
    - `knip.json` names only the entry points no plugin sees, plus the two allowed
      ignores.
    - `treatConfigHintsAsErrors` fails on an entry or ignore that matches nothing.
    - The guard refuses any other setting.
  - Deleted: 12 unused files, 185 unused exports, 58 unused types, 3 duplicate exports and
    7 unused packages, including `jszip`, `@uiw/react-md-editor` and `caniuse-lite`.
    `@opennextjs/aws` is a direct devDependency.
  - 20 tests of deleted code went with it. Where the behavior lives on, the tests now go
    through the functions the app calls.
  - New tracker row: TD-78.
- 2026-10-01: phase 4, component tests run in happy-dom (e42e64c2..9caa0457). TD-68 is
  closed.
  - Files named `*.dom.test.tsx` run in happy-dom as their own Vitest project. Everything
    else stays in Node, because happy-dom replaces `fetch`, `Request` and `Response`, and
    server renders must see no `window`.
  - happy-dom was chosen over jsdom: 32 s against 53 s for the DOM tests. jsdom also lacks
    `matchMedia` and needs Node 22.22.
  - The 43 migrated files query by role, label and text with Testing Library.
  - The hand-written fake DOM, its React interface augmentation and the naming filter are
    deleted, and `input-group.tsx` uses `instanceof Element` again.
  - The unit suite takes 248 s, up from 222 s.
  - New tracker row: TD-77. Dialog tests still use in-place stand-ins for Base UI overlays.
- 2026-10-01: phase 4, every script is TypeScript (ac014966..114c5a92). TD-63 is closed.
  - 58 scripts, the ESLint configs and rules, and the e2e runners are TypeScript, so
    `pnpm run typecheck` and the type-aware lint cover them.
    - 35 `.d.mts` files are gone.
    - It fixed 717 type errors, with outside data parsed by Zod.
  - Scripts run as `node --import tsx scripts/<name>.ts`.
  - JavaScript remains only where the tool loads no TypeScript: `.dependency-cruiser.cjs`,
    `postcss.config.js`, and one test of a JavaScript caller. The guard refuses
    JavaScript under `scripts/` unless one of those configs imports it.
  - A convention now also catches bracketed reads of the Stripe keys.
  - New tracker row: TD-76. A permission rule no longer matches the new script command,
    and a person must update it.
- 2026-10-01: phase 4, the tests reach the app's level (807fe774..d77092e4). TD-66, TD-67
  and TD-69 are closed.
  - `noPropertyAccessFromIndexSignature` is on for tests. It fixed 1,059 errors, and the
    guard holds every checked tsconfig to all five settings.
  - `no-unsafe-type-assertion` covers tests (298 fixed). The cast rule refuses `as never`
    (49 fixed) and casts of `postDataJSON()`.
  - Four stored-content tests moved from JavaScript to TypeScript, and pass stored JSON
    through the app's parsers.
  - Two `.test.mjs` files stay, because their callers really are JavaScript: workerd's R2
    ranges and `run-tool`.
  - New tracker rows: TD-73 to TD-75. TD-75 is a possible Sub-task misalignment in the
    shared-run merge.
- 2026-10-01: phase 4, app side of round 4 done: naming conventions (836ec7b4..47d6e0f7).
  - `@typescript-eslint/naming-convention` covers every TypeScript file, with its options
    in `scripts/eslint-rules/naming-conventions.ts`.
    - camelCase by default, with PascalCase allowed for components.
    - UPPER_CASE only for module-scope `const`.
    - Properties and destructured names are unchecked, since they mirror external
      contracts.
  - It fixed 68 names:
    - the 18 Drizzle table exports, now camelCase with their SQL names kept;
    - 34 underscore-prefixed destructured names;
    - 11 UPPER_CASE constants declared inside functions;
    - 5 others.
  - The guard fails if any file gets other options.
- 2026-10-01: phase 4, app side of round 5 done (41956020..a380a868). TD-30 to TD-32 are
  closed.
  - `duplicates:check` runs over `src`, `functions`, `scripts`, `db` and `tests`. The 37
    clones in app code are gone. The guard fails if a folder drops out.
  - Rule overrides:
    - `no-img-element`: `UserContentImage` is the only `<img>`, as an owned convention,
      and the per-file override is gone.
    - react-refresh: an error on every `src/**/*.tsx`, with 14 files split so that
      components and other exports live apart.
    - The reachability exemptions are gone. `scroll-area.tsx` and `use-mobile.tsx` were
      deleted, and `next.config.ts` is an entry point.
    - `no-unused-vars` lost `varsIgnorePattern` and `caughtErrors: "none"`.
    - The app's `allowJs` is `false`, with a guard.
  - Bug fixed: `deps:check` never saw npm packages. Its `exclude` dropped every path with
    `node_modules/` or `dist/`, so the rule against production code importing
    devDependencies never fired. It had hidden one such import (a380a868).
  - New tracker rows:
    - TD-70: two API Template mappers with different defaults;
    - TD-71: two access helpers;
    - TD-72: the repository's own declaration files are not type-checked under
      `skipLibCheck`.
- 2026-10-01: phase 4, the boundary rules reach the tests (69dea124..df9d9686). TD-61 is
  closed.
  - Test files are held to `serplists/no-external-data-casts`, to the type-aware
    `no-unsafe-*` rules (with types from `tests/tsconfig.json`), and to `no-explicit-any`
    and `no-this-alias`. Their test-only overrides are gone.
  - It fixed 996 hits in 203 files, plus 92 `JsonRecord` casts in the MCP tests.
  - The browser specs' request helpers take the app's schemas.
  - Doubles are typed through the interfaces they stand in for (`SqliteD1` implements
    `D1Database`; `InMemoryR2Bucket`).
  - `pnpm run lint` takes about 85 to 90 s.
  - New tracker rows:
    - TD-67: `as never` and `postDataJSON()`;
    - TD-68: a real DOM in place of the fake one, whose `createRoot` support extends a
      React interface marked internal;
    - TD-69: four stored-content tests written in JavaScript.
- 2026-10-01: phase 4, app side of round 3 done (f777bde3..1902fa14). TD-64 is closed.
  - `noPropertyAccessFromIndexSignature` is on for the app, node and API projects, and the
    guard test holds them to it. It fixed 656 errors.
    - Stored checklist JSON reads through typed record shapes in
      `src/lib/schemas/jsonRecords.ts`.
    - Dictionaries that really vary are read with brackets.
    - `NEXT_PUBLIC_` variables are declared, since Next.js inlines only dot reads.
  - The tests set it off until their round.
  - `no-unsafe-type-assertion` covers the app's TypeScript and fixed 62 assertions, most by
    narrowing or a Zod parse.
  - ESLint's recommended JavaScript rules, `no-undef` among them, cover `.js`, `.mjs` and
    `.cjs`. That is TD-63's first step; converting the scripts is left.
- 2026-10-01: phase 4, the small app tracker fixes are done: TD-33 to TD-39, TD-41 to TD-44,
  TD-60 and TD-62 (5523d3d8..45f90f31; TD-35's code landed in d457042d).
  - One `countTemplateItems` serves all ten places that counted tasks, and no number
    changed.
  - One upload limit formatter, which floors. No message changed.
  - One timestamp parser. A zoneless ISO time now sorts as UTC.
  - Loopback hosts:
    - `isLoopbackHostname` follows the decided rule.
    - The Run Key and MCP gates and the `/api/mcp` Host check keep the exact names, as
      `isCanonicalLoopbackHostname`.
    - Local API URLs also accept `0.0.0.0`, as `isLocalDevelopmentUrl`.
  - The query-key convention now covers the template detail key.
  - `check-preview-d1-binding` parses `wrangler.toml` and reads the `DB` binding.
  - New tracker rows: TD-65 (an avatar message that needs the owner) and TD-66.
- 2026-10-01: phase 4, app side of round 2 done: boundary validation
  (01ee5793..8d3ec6d7). TD-2, TD-50 and TD-59 are closed.
  - `serplists/no-external-data-casts` refuses casts of `JSON.parse`, response bodies,
    storage reads, message data and form data, and every `as unknown as`. It covers
    `src/`, `functions/`, `scripts/` and `db/`, and fixed 65 casts.
  - The type-aware `no-unsafe-*` rules fixed 29 more. They run in
    `eslint.type-aware.config.ts`, which `pnpm run lint` uses.
  - `apiRequest(endpoint, schema)` takes a required Zod schema at all 56 endpoints, and
    the client's types are `z.infer` of shared schemas in `src/lib/schemas/`. A response
    it cannot read is an `ApiError` with code `unreadable_response`.
  - D1 rows are typed with Drizzle's `$inferSelect`, which removed 54 double casts.
  - Stripe replies, the webhook body, stored JSON and browser storage are parsed.
  - Bug fixed: the Stripe webhook recorded signed events with mistyped fields. It now
    answers 400 (7ee8b92c).
  - `pnpm run lint` takes about 49 s, up from 21 s.
  - New tracker rows:
    - TD-63: `.mjs` scripts are not type-checked, and the recommended JavaScript rules
      skip them;
    - TD-64: internal type assertions.
- 2026-10-01: phase 4, the round 1 settings reach the tests, and `!` is refused everywhere
  (9f50b031..d3c7dcff). TD-58 is closed.
  - `tests/tsconfig.json` inherits the four settings. It fixed 973 errors, 914 of them from
    `noUncheckedIndexedAccess`.
  - `typecheck-coverage.test.ts` fails when any checked tsconfig turns one off.
  - ESLint's `no-non-null-assertion` covers every TypeScript file. It fixed 96 assertions.
  - Tests narrow with `assert.exists()` or `tests/support/elements.ts` (`elementAt`,
    `onlyElement`, `taskAt` and the like). These throw an error that names what is
    missing.
  - `pnpm run verify` passed at 198289da (5,811 tests), before this round.
- 2026-10-01: phase 4, the test-side tracker fixes are done: TD-40, TD-48, TD-49, TD-51 to
  TD-57, and TD-50 apart from one test that waits for TD-2 (5c8111f4..d85d62e5).
  - `tests/tsconfig.json` sets `allowJs: false`, so a test that imports a `.mjs` without a
    `.d.mts` fails the type check. 14 declaration files were added.
  - Other changes:
    - one `.env` parser, `scripts/lib/env-file.ts`;
    - one `postcss` version, with no override;
    - `@types/node` 22.20;
    - `wrangler.toml` parsed with smol-toml and Zod.
  - The browser specs' setup-request and seeded-path checks are ESLint conventions over
    `tests/e2e`.
  - A test drives every audit-writing route and fails on an action that is registered but
    never written, or written but not registered.
  - Bug fixed: the migration-baseline guard read `wrangler.toml` line by line, so it would
    have missed a database written as an inline table (63345d9d).
  - New tracker rows: TD-61 (the browser specs' request helpers cast bodies) and TD-62.
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
      with its table in `scripts/eslint-rules/code-conventions.ts`, and
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
  `scripts/eslint-rules/code-conventions.ts`. An entry may name `owners`, the modules
  that implement the convention (the clipboard helper may touch the clipboard), as
  ESLint's `ignores` already did for `browserStorage.ts` and the logger. That is the
  rule's definition, not an exception.
  - The `useTemplateLibrary` entry's owners are the pages that have loading and failure
    tests. A new page joins once it has them.
- 2026-10-01: `routeRateLimitBucket` counts every state-changing request as a write unless
  its route is exempt. Before, the router's source was read by a test to check that each
  family was listed. Existing routes are limited as before, and a write to a path no
  handler serves now counts too.
- 2026-10-02: the browser tests run on pull requests only (the owner's call). They take the
  longest and cost the most to run on every push. A push to `staging` already builds again
  to deploy, and its PR ran the browser tests before it merged.
- 2026-10-02: `cloudflare-env.d.ts` is not type-checked with `skipLibCheck` off. It is a
  generated file, already among the allowed exceptions, and it references OpenNext's
  `.open-next/worker.js`, which OpenNext ships without a declaration.
  - Every way to check it strictly needs an exception of its own: `allowJs` over the 11 MB
    bundle, `noImplicitAny: false`, OpenNext's declarations that clash with the workerd
    types, or a hand-kept declaration under the deprecated `node10` resolution.
  - The app still compiles against it under `skipLibCheck`.
- 2026-10-01: knip counts tests as users of an export.
  - 174 exports are used by their own module and also imported by a unit test of that
    helper. They stay exported.
  - Testing a module's helpers directly is a choice about test design, not dead code.
    Forcing every such test through a public function would rewrite about 100 test files
    for little safety.
  - An export that only tests use, and that its own module does not use, is dead code,
    and knip deletes it.
- 2026-10-01: scripts run as `node --import tsx`.
  - Not Node's own type stripping: local Node 22.16 needs a flag for it, and it cannot
    resolve the `@/` alias or extensionless imports that the seed, sitemap and profiling
    scripts load.
  - Not the `tsx` command: it starts a second process, and one process keeps Ctrl+C, exit
    codes and the dev launcher's pid as they were.
  - Start-up costs about 200 to 300 ms more per hook script.
- 2026-10-01: the naming rule matches two names by name, because another module dictates
  them; no file is carved out.
  - The HTTP method names Next.js route handlers must export.
  - React DOM's create-root container interface, which the fake DOM augmented. It went
    with the fake DOM (TD-68, 8411df12), and the rule now refuses that augmentation.
- 2026-10-01: rule override audit decisions.
  - `argsIgnorePattern: "^_"` stays. Some parameters exist only for their type:
    TanStack infers `mutate()`'s variables from `mutationFn`'s parameter, and test doubles
    declare the signature they stand in for. The `_` prefix says so at the parameter,
    and every other unused binding is refused.
  - `skipLibCheck` stays. Without it, `tsc` reports over 1,300 errors in third-party and
    generated declaration files the repository cannot edit. TD-72 checks the repository's
    own declaration files.
  - `@next/next/no-img-element` is off everywhere. It only warned. The owned
    `UserContentImage` convention refuses `<img>` as an error: user images come from R2
    under any key with unknown sizes, and Workers has no image optimizer.
  - The dependency-cruiser exclusions of declaration files, tests and route files define
    what its rules are about. They are not exemptions.
- 2026-10-01: TD-34 and TD-36 decisions.
  - A host is local when it resolves to this machine: `localhost`, `*.localhost`,
    `127.0.0.0/8` and `::1`.
  - The security gates keep their exact list (`localhost`, `127.0.0.1`, `::1`): Run Key and
    MCP availability when the flag is unset, and the MCP Host check against DNS
    rebinding. Widening a credential gate gains nothing.
  - A zoneless ISO timestamp is UTC, as D1 stores times.
- 2026-10-01: the type-aware lint rules run from `eslint.type-aware.config.ts`, the base
  config plus one block, and `pnpm run lint` uses it. The pre-commit hook and the editor
  keep the base config.
  - With type information, ESLint cannot lint the in-memory samples that
    `code-conventions.test.ts` and `no-exceptions.test.ts` use.
  - Type-aware lint takes about 2.4 times as long, which the owner's machine feels on
    every commit.
  - Every file is still held to the rules by `pnpm run verify`, the pre-push hook and CI,
    so this exempts no code.
  - Rejected: one config, with those tests building ESLint without type information.
- 2026-09-30: the Node clone hazard is TD-29, not TD-27. TD-27 and TD-28 were the MCP result
  bounds, closed earlier. The tracker now keeps a next-ID line, so a closed ID is never
  reused.
