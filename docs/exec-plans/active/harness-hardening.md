# Harness hardening

Last updated: 2026-09-30

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
| Type-checked tests | No tsconfig includes `tests/`: 685 errors in 86 files under `strict` | A tests tsconfig in `pnpm run typecheck`; fix the errors |
| No code comments | 7,996 comments in 1,080 files, plus `.dev.vars.example`, `.gitignore`, `.gitattributes` and `.npmrc` | A lint rule and a repository check; remove them all, moving what they knew into docs, names and tests |

## Phases

1. [ ] No exceptions: split the 8 oversized files, fix the suppressions, dependency
   violations, directives and skipped tests, delete the exception mechanisms, and add a
   check that they stay gone.
2. [x] Comment enforcement tooling: the ESLint rule and the check for other file types,
   with tests; size the new verifications in report mode.
3. [ ] Remove every comment, area by area, moving what each one knew into the doc that owns
   the area, a name, or a test; then enable the comment checks.
4. [ ] New verifications: a tests tsconfig, then naming conventions, boundary validation,
   duplicates, dead code and stricter types; fix what each finds, then enforce it.
5. [ ] Agent loops: code gardening, quality re-grading, `@claude` feedback, each tried in
   the sandbox repository first.
6. [ ] Observability: the log query tool and its skill.
7. [ ] Docs, `pnpm run verify`, and the full browser suite.

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

## Exceptions allowed

- **Generated files:** `cloudflare-env.d.ts`, `next-env.d.ts`, `pnpm-lock.yaml`,
  `docs/generated/` and the rest of `GENERATED_FILES` in `scripts/check-no-comments-lib.mjs`.
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
- 2026-09-30: phase 1 in progress.
  - The dependency baseline and the suppressions file are deleted (d8c57803, 9516e451).
  - The two lint directives are gone (bbb7815c), and the dependency violations are fixed
    (94d6b0a6).
  - The skipped API integration tests run through the router on local D1 (6e97803b). They
    found a sign-up bug, fixed in 091c6cb1.
  - The oversized files are being split (25ef1577, d7a86614, e7e83ddd, f879002b, 15d22f4f,
    54cbb9b8, df24fe48).
- 2026-09-30: phase 2 done. The no-comments ESLint rule (18e4dcd2) and the check for YAML,
  TOML, SQL, CSS, JSON and patches (64516b84) have 34 tests. The sizing is above.
- 2026-09-30: phase 5 started in the sandbox repository.

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
