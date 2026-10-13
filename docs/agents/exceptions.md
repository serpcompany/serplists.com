# Exceptions to the rules

Every place a rule in [`code.md`](code.md) doesn't apply, and why. A rule is never switched off in
the code it flags, since an inline directive is a comment, so there are two kinds of exception and
no third. Add a row in the pull request that makes an exception, and remove it in the one that
ends it.

## Lists beside the checks

Each list is in its check's own code. The first three only shrink: their check fails an entry that
grew, asks for one to be lowered as the thing shrinks, and for it to go once it isn't needed. An
entry is never added or raised to make a check pass, though nothing refuses one yet
([`harness-debt.md`](../harness-debt.md), Checks).

| List | Each entry holds |
| --- | --- |
| `knownLargeFiles` in `scripts/checks/sizes.ts` | A code file over 500 lines, its size, and why splitting it is unsafe now; the check fails an entry without a reason. None today |
| `knownDuplicates` in `scripts/checks/known-duplicates.ts` | A pair of files that repeat a block, their number of blocks, and why sharing is unsafe now; the check fails an entry without a reason. None today |
| `knownLongDocs` in `scripts/checks/doc-rules/budgets.ts` | A doc over its size budget when the check arrived, and that size. No reason: every entry has the same one, a doc older than the budget, and splitting them is a row in [`harness-debt.md`](../harness-debt.md), Harness |
| `GENERATED_FILES` in `scripts/check-no-comments-lib.ts` | A path, nothing else: a tool writes the file, which is the reason. They are the lockfile, `cloudflare-env.d.ts`, the portable Template JSON Schema, the bundled sitemap catalog, and the example Templates' `template.json` and `preview.html`. The comment, duplicate and size checks leave them as written |

The weekly maintenance report counts the first three ([`ci-agents.md`](ci-agents.md)).

## Rules a tool's config turns off or narrows

A config file can't hold a reason, so each rule it turns off or narrows is here.

| Where | What is off or narrowed | Why |
| --- | --- | --- |
| `eslint.config.ts`, global ignores | Build output, `tmp/`, test reports, the agent worktrees inside `.claude/`, and the generated `next-env.d.ts` and `cloudflare-env.d.ts` | Nothing there is written by hand here: a build or a tool writes it, and another checkout is checked in itself |
| `eslint.config.ts`, every TypeScript file | `@next/next/no-img-element` is off | A user's image has no known size and may come from any host, so `UserContentImage` renders it with `<img>`; the `restricted-code` convention allows `<img>` only there |
| `eslint.config.ts`, every TypeScript file | `@typescript-eslint/no-unused-vars` lets through an argument named `_…` and a rest sibling | An argument can matter for its type alone (TanStack infers a mutation's variables from `mutationFn`; a test double declares the signature it stands in for), and a rest object is how a field is dropped |
| `eslint.config.ts`, TSX files in `src/` | `react-refresh/only-export-components` allows the exports Next.js reads from a route module (`metadata`, `generateMetadata`, `dynamic` and the rest) | Next.js reads them by name |
| `eslint.config.ts`, the navigation modules (`Link.tsx`, `useAppRouter.ts`, `leavesPage.ts`, `RequireAuth.tsx`) | The `next/link` and `useRouter` import restriction | They wrap what every other module uses instead, so they import it |
| `eslint.config.ts`, `src/lib/browserStorage.ts` | The `localStorage` and `sessionStorage` restriction | It is the one module that reads storage, guarding against a browser that blocks it |
| `eslint.config.ts`, `functions/api/utils/logger.ts` | The `console.*` restriction in `functions/` | It is the logger: it writes each structured line to the console, which Workers Logs reads |
| `eslint.config.ts`, test files in `src/views`, `src/components` and `src/features` | The vocabulary rule | ESLint takes one `no-restricted-syntax` list per file, and test files keep the one that refuses skipped tests |
| `scripts/eslint-rules/code-conventions.ts` | Each convention's `owners` | The module that owns the code a convention keeps out of everything else, such as `src/lib/progress.ts` for progress percentages |
| `eslint.type-aware.config.ts` | The type-aware rules read `src/`, `functions/`, `db/`, `scripts/`, the skills' scripts and `tests/`, not the root config files or `tools/` | Each area lints in a process of its own with one TypeScript project; the root configs are a gap ([`harness-debt.md`](../harness-debt.md), Checks), and `tools/` holds JavaScript |
| `tsconfig.json`, `tsconfig.node.json` | `noUnusedLocals` and `noUnusedParameters` are off | ESLint's `no-unused-vars` holds the same rule everywhere, with the `_` argument above, so TypeScript would report each twice |
| The four code tsconfigs | `skipLibCheck` is on | Without it `tsc` reports over 1,300 errors in third-party declaration files; `tsconfig.declarations.json` checks the repository's own with it off |
| `tsconfig.declarations.json` | The root `next-env.d.ts` and `cloudflare-env.d.ts` are left out | Both are generated, and `cloudflare-env.d.ts` names the build output, which exists only after a build |
| `.dependency-cruiser.cjs`, `SHARED_FROM_SRC` | `api-imports-only-shared-src` lets `functions/` import these modules from `src/` | The API and the app share Zod schemas and pure helpers, which `shared-src-stays-framework-free` keeps free of React, Next.js and the API client |
| `.dependency-cruiser.cjs`, `exclude` | Build output and `*.generated.json` | They aren't code: the bundled sitemap catalog is data a script writes |
| `.dependency-cruiser.cjs`, the reachability rules | Declaration files, tests, JSON, and the files they start from (the routes, Next.js's instrumentation and proxy files) | Declarations and JSON don't run, tests run under Vitest, and the entry points are what Next.js loads by name |
| `.dependency-cruiser.cjs`, the production-code rules | Tests beside the code (`*.test.ts`, `*.test.tsx`) | They run only under Vitest |
| `.dependency-cruiser.cjs`, `screens-do-not-call-transport` | A type-only import of the API client | A view may name the types a hook returns |
| `knip.json`, `ignoreDependencies` | `@secretlint/secretlint-rule-preset-recommend` | Secretlint loads it by name from `.secretlintrc.json` |
| `knip.json`, `ignoreBinaries` | `stripe` | The Stripe CLI is installed outside npm |
| `knip.json`, `entry` | `open-next.config.ts` | OpenNext's CLI reads it by path |
| `knip.json`, `entry` | `scripts/stripe/bootstrap.ts` | A person runs it ([`billing.md`](billing.md)) |
| `knip.json`, `entry` | `tests/e2e/preview-server.ts`, `tests/support/nextFontGoogle.ts` | Playwright starts the first as its web server, and Vitest loads the second in place of `next/font/google` |
| `knip.json`, `entry` | `tools/checks/hook.mjs` and `stop-hook.mjs`, and `scripts/checks/hook.ts` and `stop-hook.ts` | Claude Code runs the hooks by path from `.claude/settings.json`, and each runs its TypeScript half by path |
| `knip.json`, `entry` | `tools/checks/*.d.mts` | TypeScript reads a `.d.mts` beside the `.mjs` it describes |
| `knip.json`, `entry` | `.claude/skills/*/*.ts` | A skill's steps run its script by path, from its `SKILL.md` |
| `knip.json`, `drizzle` and `eslint` | `db/drizzle.config.ts`, `eslint.type-aware.config.ts` | `db:generate` and `pnpm run lint` pass them to their tools by path |
| `.jscpd.json`, `ignore` | Build output, `db/migrations/`, and the generated files | Applied migrations are append-only history that can't be edited to share code, and a migration that rebuilds a table restates all of it |
| `vitest.config.ts` | No test files under `node_modules`, `dist`, `tmp`, the Playwright reports, `tests/e2e/` or the agent worktrees inside `.claude/` | Playwright runs `tests/e2e/`, and the rest isn't this checkout's tests |
| `package.json`, `test:run` | The local D1 tests | They run in `test:local-d1`, and `tests/unit/config/no-exceptions.test.ts` fails on one that runs in neither |

## JavaScript

Code is TypeScript, so `pnpm run typecheck` reads it. JavaScript is allowed only where no
TypeScript loader runs it, and `tests/unit/config/typecheck-coverage.test.ts` fails on it anywhere
else. ESLint's recommended JavaScript rules hold each of these files, with Node's globals.

| Where | Why |
| --- | --- |
| `postcss.config.js` and `.dependency-cruiser.cjs`, and what they import | Their tools read them as JavaScript |
| `tools/checks/*.mjs`, with a `.d.mts` beside one TypeScript imports | Claude Code runs the hook entries, and CI the pull request check, with plain Node before packages are installed: they say how to install them, and CI's check needs no install |
| `.github/actions/**/*.cjs` | GitHub runs a composite action's script with plain Node, with nothing installed |
| `tests/**/*.test.mjs` | A test of what a JavaScript caller may pass that the declared types rule out, such as the range workerd's local R2 reports |
