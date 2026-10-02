# Core Beliefs

Opinionated rules that keep this repository legible to the next agent run. Each
rule says why it exists and what enforces it. When a review comment or bug shows
that a rule is missing, add it here and, whenever possible, promote it into a
lint rule, dependency rule, or check with an error message that explains the fix.

## Operating beliefs

- **The repository is the system of record.** Decisions, plans, and debt that are
  not in the repo do not exist for the next run. Write them into
  [exec plans](../PLANS.md), [design docs](index.md), or the
  [tech debt tracker](../exec-plans/tech-debt-tracker.md), not only into chat or issues.
- **Enforce invariants, not implementations.** Boundaries, data shapes, and
  vocabulary are strict; how code is written inside them is flexible.
- **Fix the harness, not just the symptom.** When an agent makes the same mistake
  twice, add the missing doc, check, or tool.
- **Pay debt continuously.** Small cleanups every week beat periodic rewrites. See
  [maintenance](agent-workflow.md#weekly-maintenance).
- **Prefer boring, inspectable dependencies.** Choose libraries whose behavior can
  be read and tested in-repo over opaque ones.

## Rules

| Rule | Why | Enforced by |
| --- | --- | --- |
| Type-check everything under `strict` | Types are the fastest feedback loop an agent gets | `pnpm run typecheck` (`tsc -p` over the app, node, API and tests projects) |
| Every TypeScript file is type-checked | A file no checked tsconfig includes is never type-checked, so its errors pass without failing anything | `tests/unit/config/typecheck-coverage.test.ts` fails on a TypeScript file no tsconfig in `pnpm run typecheck` includes, or a tsconfig it skips |
| Code, tests included, is typed stricter than `strict`: a read that can find nothing, a property that can hold `undefined`, an override and a switch case each say so | An index read can find nothing, an optional property can be set to `undefined`, a renamed base method strands its override, and a case can run into the next; code typed as if none can happen crashes or drops a value | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `noFallthroughCasesInSwitch` in `tsconfig.json`, `tsconfig.node.json` and `functions/tsconfig.json`, and in `tests/tsconfig.json` by inheritance, so the tests are typed the same way, checked by `pnpm run typecheck`; `tests/unit/config/typecheck-coverage.test.ts` fails when a checked tsconfig turns one off; the app, node and API tsconfigs add `noPropertyAccessFromIndexSignature` (the row on known keys below) ([quality gates](../RELIABILITY.md#quality-gates)) |
| Read a known key through a type that names it; index only a dictionary whose keys vary | A dot read off `Record<string, unknown>` looks typed but guesses the key, so a renamed or missing one compiles and reads `undefined` | `noPropertyAccessFromIndexSignature` in `tsconfig.json`, `tsconfig.node.json` and `functions/tsconfig.json`, checked by `pnpm run typecheck`; values are typed as Drizzle rows, Zod outputs or the record shapes in `src/lib/schemas/jsonRecords.ts`; `tests/unit/config/typecheck-coverage.test.ts` fails when one of the three turns it off, and the tests' tsconfig turns it off until a later round ([quality gates](../RELIABILITY.md#quality-gates)) |
| Narrow a value that can be missing; never assert it with `!` | A `!` tells the compiler a value is there without checking, so a missing one crashes later as a `TypeError` far from the read | ESLint `@typescript-eslint/no-non-null-assertion` on every TypeScript file, tests included; tests narrow with `assert.exists()` or the helpers in `tests/support/elements.ts`, which name what is missing ([testing conventions](../RELIABILITY.md#testing-conventions)) |
| Give a JavaScript module a test imports a declaration file beside it | Without one TypeScript infers the module's types from its code, so a test can pass a value the module never handles, or none it does | `tests/tsconfig.json` turns `allowJs` off, so `pnpm run typecheck` fails on a test's import of a `.mjs` file with no `.d.mts` ([testing conventions](../RELIABILITY.md#testing-conventions)) |
| Parse data at boundaries; never guess shapes | Code built on guessed shapes breaks silently | API bodies arrive as `unknown` under strict TS and are parsed with Zod (`functions/api/utils/payloads.ts`); the API client parses every answer with its endpoint's schema (`apiRequest` in `src/lib/api/request.ts`, [client data](client-data.md#the-api-client)) |
| Parse external data with a Zod schema; never cast it or let an `any` through | A cast or an `any` trusts a guessed shape, so a changed or malformed answer breaks far from where it arrived | ESLint `serplists/no-external-data-casts` on `src/`, `functions/`, `scripts/`, `db/` and every test file (casts of `JSON.parse`, response bodies, storage reads, message data and form fields, and every `as unknown as`), the type-aware `@typescript-eslint/no-unsafe-*` rules on their TypeScript files and the tests' in `pnpm run lint`, and `no-explicit-any` and `no-this-alias` on tests as on app code (`tests/unit/config/external-data-boundaries.test.ts`, [repository checks](../RELIABILITY.md#repository-checks)) |
| Narrow or parse a value; never assert a narrower type with `as` | An assertion tells the compiler a value has a shape without checking, so a wrong guess fails far from the cast, and nothing tells the next reader it was a guess | ESLint `@typescript-eslint/no-unsafe-type-assertion` on the TypeScript in `src/`, `functions/`, `scripts/` and `db/` in `pnpm run lint` (`eslint.type-aware.config.js`); tests join later (`tests/unit/config/external-data-boundaries.test.ts`, [repository checks](../RELIABILITY.md#repository-checks)) |
| Hold JavaScript files to ESLint's recommended rules, with the globals of where they run | TypeScript does not check `.js`, `.mjs` or `.cjs` files, so a name nothing defines fails only as a `ReferenceError` when the line runs | `js.configs.recommended`, `no-undef` among them, on every JavaScript file in `eslint.config.js`, with Node's globals: no browser globals, and CommonJS's wrapper variables only in `.cjs` files (`tests/unit/config/javascript-recommended-rules.test.ts`, [quality gates](../RELIABILITY.md#quality-gates)) |
| Bound every D1 query and back it with a matching index | D1 bills rows scanned, so an unbounded or unindexed query costs more as the table grows | [D1 cost](d1-cost.md) rules; `pnpm run d1:profile` before merging query changes |
| Keep each hot request within its rows-read budget | A lost `LIMIT` or index multiplies what every request costs long before it is slow, and a wall-clock bound only flakes | `tests/integration/rows-read-budgets-local-d1.test.ts` in `pnpm run test:local-d1`, which CI runs: a constant budget for a bounded request, one that grows with the rows it must read for a request unbounded by design ([D1 cost](d1-cost.md#measuring)) |
| Respect layer boundaries | Keeps domains independently changeable | `pnpm run deps:check`; see [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| Log through the structured logger in the API; never log emails, tokens, or other personal data | Logs must be queryable JSON with a `requestId` | ESLint `no-restricted-syntax` on `console.*` in `functions/` |
| Use [PRODUCT_SENSE.md](../PRODUCT_SENSE.md) vocabulary in user-visible text | Product language drifts fast | ESLint `no-restricted-syntax` on Team/Workspace copy in UI code |
| Keep files under 500 lines | Large files are hard for agents to change safely | ESLint `max-lines` on every authored code file (every JavaScript and TypeScript file but the generated ones), tests, scripts, seeds and config included, with no per-file caps or excluded folders (`tests/unit/config/no-exceptions.test.ts`) |
| No unused code | Dead code gets copied and "fixed" by mistake | ESLint `@typescript-eslint/no-unused-vars`, `deps:check` |
| No duplicated code | A copy drifts from the code it copied, and a fix reaches only one of them | `pnpm run duplicates:check` (jscpd at its defaults, 50 tokens and 5 lines, with a threshold of 0) over `src/`, `functions/`, `scripts/`, `db/` and `tests/` together in `check:repo`, `db/migrations` and generated files aside; `tests/unit/config/duplicate-check.test.ts` fails if the settings loosen, the check stops running, a folder drops out or jscpd skips a file it could check ([repository checks](../RELIABILITY.md#repository-checks)) |
| Tests check what code does, not how it is written | A test that matches source text breaks on a harmless refactor and passes when the behavior breaks | ESLint `serplists/no-source-text-reads` on every test file: no reading a code file or folder under `src/` or `functions/` as text, and no `?raw` import of one (`tests/unit/scripts/no-source-text-reads-rule.test.ts`, [repository checks](../RELIABILITY.md#repository-checks)) |
| Write a rule about how all code is written as a lint rule, with what to do instead | A rule a test enforces by scanning the code is one more text match; a lint rule names the line and the fix | ESLint `serplists/restricted-code` with the conventions in `scripts/eslint-rules/code-conventions.mjs` (each with its message and the module that owns the code), and `serplists/navigate-while-visit-is-current`; `tests/unit/config/code-conventions.test.ts` lints a sample of each with the real config |
| Browser specs set up data through the API helpers and open only Templates the e2e stack has | A fetch inside `page.evaluate()` runs a CORS preflight and fails as `TypeError: Failed to fetch`, and a spec that opens a Template nothing seeds fails only in the browser run | ESLint `serplists/restricted-code` with `BROWSER_TEST_CONVENTIONS` on `tests/e2e/`; `tests/unit/e2e/seeded-template-paths.test.ts` checks the Templates the convention lists against the seed and the bundle ([testing conventions](../RELIABILITY.md#testing-conventions)) |
| Every test runs | A skipped test hides behavior that stopped working | ESLint `no-restricted-syntax` on `.skip`, `.todo`, `skipIf`, `runIf`, `fixme`, `x*` and `.only` in Vitest and Playwright files; a test file left out of `test:run` must be in `test:local-d1` (`tests/unit/config/no-exceptions.test.ts`) |
| Keep docs true and in their place | Stale or scattered docs mislead every future run | `pnpm run docs:check` in CI (layout, links, paths, catalogs); a weekly doc-gardening agent opens fix-up PRs ([maintenance](agent-workflow.md#weekly-maintenance)) |
| Generated artifacts stay in sync | Drift between source and artifact is invisible | `schema:portable:check`, `db:schema:check`, `templates:check`, `check:db:drizzle-parity` in CI; the sitemap catalog is regenerated by every build |
| No secrets in the repository | Leaked keys are unrecoverable | `pnpm run secret:scan` in CI and pre-commit |
| No comments | A comment goes stale without failing anything; names, tests named for the behavior and the doc that owns the area hold what it would say | ESLint `serplists/no-comments` on every TypeScript and JavaScript file, with inline config off; `pnpm run comments:check` on every other format, in `check:repo` and pre-commit; `tests/unit/scripts/comment-check-coverage.test.ts` fails on a file neither covers ([repository checks](../RELIABILITY.md#repository-checks)) |

## No exceptions

Every check applies to every file. There are no lint suppressions, dependency baselines,
per-file size caps, or skipped tests: when a check fails, fix the code. If a rule itself
seems wrong, stop and ask a human. An exception needs an extremely good reason, recorded
in the [harness hardening plan](../exec-plans/active/harness-hardening.md#exceptions-allowed).

`tests/unit/config/no-exceptions.test.ts` fails when one comes back: an authored code file not
held to `max-lines` 500, `eslint-suppressions.json` or a suppression flag, a dependency-cruiser
baseline, `--ignore-known` or a rule below `error`, or a test file no suite runs. ESLint
refuses skipped, todo, fixme and focused tests.
