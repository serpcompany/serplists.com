# Quality gates

| Where | What runs |
| --- | --- |
| Pre-commit hook | Secret scan, ESLint (`eslint.config.ts`, without the type-aware rules) and the comment check on staged files; the commit-msg hook refuses a `fix:` commit that stages no test |
| Pre-push hook | `pnpm run verify`, at below-normal CPU priority (`scripts/run-at-low-priority.ts`) |
| `pnpm run verify` | Env contract, lint (type-aware: code conventions, naming conventions, external data parsed at the boundary in app code and tests alike, no narrowing type assertions, ESLint's recommended rules on JavaScript files and tests that read no source text included), `pnpm run typecheck`, covering the app, node (root config, the ESLint configs and every script), API and tests projects and, with `skipLibCheck` off, the declaration files the repository writes, `check:repo` (secrets, docs, comments, architecture, duplicated code, dead code, generated artifacts), unit tests |
| CI Quality Gate | `verify` steps plus the local D1 tests (`test:local-d1`, the rows-read budgets of the hot requests included), on every pull request and every push to `main` and `staging`; on a pull request, every `fix:` commit must change a test |
| Browser tests (pull requests only) | `.github/workflows/browser-tests.yml`: the OpenNext build (`build:worker`) and the browser tests against it, smoke on PRs into `staging`, plus every browser spec the PR adds or changes, and the full suite on PRs into `main`, on the standard `ubuntu-latest` runner. Pushes run neither: they are the slowest and most expensive checks, and a push to `staging` builds again to deploy |
| CI schema parity | Replays every migration and compares it with the Drizzle schema |
| Claude code review | Advisory inline review comments on every non-draft PR; never blocks merging ([agent workflow](ci-agents.md#claude-code-review)) |
| Before a release | `pnpm run verify:release` locally; `pnpm run verify:staging` or `pnpm run verify:prod:d1` for remote D1 readiness (needs Cloudflare credentials) |

ESLint's `max-lines` holds every authored JavaScript and TypeScript file
(`**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`: source, tests, browser specs, scripts, seeds and root
config) to 500 lines, blank lines included. Only the generated files in ESLint's global ignores are outside it, and
`tests/unit/config/no-exceptions.test.ts` fails on any other file it misses. Split a file
that grows past the limit by responsibility; `pnpm run maintenance:report` lists the files
at 450 lines or more.

`pnpm run typecheck` runs `next typegen`, then `tsc -p` over four projects: `tsconfig.json`
(`src/` and what it imports), `tsconfig.node.json` (root config and `scripts/`),
`functions/tsconfig.json` (the API and `db/`) and `tests/tsconfig.json`, and a fifth for the
declaration files (`tsconfig.declarations.json`, below). Each adds four
settings to `strict`, the tests' tsconfig by inheriting them from the app's:
- `noUncheckedIndexedAccess`: an array element or record value read by index may be
  `undefined`;
- `exactOptionalPropertyTypes`: an optional property takes `undefined` only when its type
  says `prop?: T | undefined`, so a value that reaches JSON, a log line or a spread is left out
  instead of set to `undefined`;
- `noImplicitOverride`: a class member that overrides its base says `override`;
- `noFallthroughCasesInSwitch`: a `case` with statements cannot run on into the next one.

Fix an error they report by handling the case it names: narrow the value, give it a default
that is right for that case, or throw an error that says what was missing. Add
`| undefined` to an optional property only where a caller really passes `undefined`, and
never silence the error with a `!` or a cast. ESLint's `@typescript-eslint/no-non-null-assertion`
refuses a `!` in every TypeScript file, and `tests/unit/config/typecheck-coverage.test.ts`
fails when a tsconfig that `pnpm run typecheck` runs turns one of the four settings, or the fifth
below, off. Tests read what may be missing through the helpers in `tests/support/elements.ts`
([testing conventions](testing.md#testing-conventions)).

All four tsconfigs add a fifth, `noPropertyAccessFromIndexSignature` (the tests' by inheriting
it): a key read with a dot must come from a type that names it, so `record.title` on a
`Record<string, unknown>` is an error. Type the value with the shape it has instead:
- a Drizzle row (`$inferSelect`, or a `Pick` or `Partial` of it), a Zod output, or the result
  type of the function that built it;
- for stored checklist JSON, the record shapes in `src/lib/schemas/jsonRecords.ts`
  (`SectionRecord`, `TaskRecord`, `ContentRecord`, `SubTaskRecord`), which name the keys the
  code reads, keep every other stored field, and narrow through `isSectionRecord` and the
  like with no cast;
- for any other JSON map read by known keys (MCP tool results, audit metadata, request
  bodies), an interface that extends `JsonRecord` and names those keys as `unknown`, or a Zod
  object with `.passthrough()`. A passthrough object puts the keys it names first, so keep
  `z.record()` where the parsed value's key order is serialized or hashed.

Index with brackets only a dictionary whose keys vary: `process.env` in scripts and configs, a
`dataset`, headers, query parameters. Read the `undefined` that `noUncheckedIndexedAccess`
gives. The app's `NEXT_PUBLIC_` variables are declared on `NodeJS.ProcessEnv`
(`src/next-public-env.d.ts`), since Next.js inlines only `process.env.NAME` read with a dot.
`typecheck-coverage.test.ts` fails when any tsconfig `pnpm run typecheck` runs turns the setting
off. The tests' tsconfig includes `src/next-public-env.d.ts` too, since they type-check
`src/env.ts`.

Tests read known keys the same way:
- a D1 row a handler wrote or a test selected as `StoredRow` (`tests/support/d1Doubles.ts`), which
  names every column of every Drizzle table as `unknown`. The Drizzle chain mocks record each
  `values()` and `set()` row with it, and `SqliteD1.rows()` returns it.
- stored sections through `storedSections` (`tests/support/storedJson.ts`), which parses into the
  record shapes above, and a log line through `logLineIn`;
- an MCP result as `McpRecord` (`tests/support/mcpResponses.ts`), and an element's props as
  `ElementProps` (`tests/support/elementTree.ts`);
- a response body through the app's schema for it, or a passthrough schema that names the keys
  the test reads.

A test reads with brackets only a dictionary whose keys vary: `process.env`, headers, a workflow
step's `env` and `with`, an HTML element's attributes, a log line's event fields, and an audit
row's diff and metadata, whose keys vary by action.

No project takes JavaScript into its program untyped: the app's tsconfig sets `allowJs: false`
(Next.js adds its suggested `allowJs: true` only when the key is missing), the node and API
projects leave it at TypeScript's default of off, and the tests' tsconfig turns it off too.
`skipLibCheck` stays on in those four projects: without it `tsc` reports more than 1,300 errors in
declaration files the repository cannot edit (miniflare's, better-auth's, Drizzle's MySQL and
SingleStore builders, `lib.dom.d.ts` against the Workers types, the generated
`cloudflare-env.d.ts` and Next.js's `.next/types`). It skips every declaration file, the
repository's own too, so a fifth project, `tsconfig.declarations.json`, checks the declaration
files the repository writes (every `.d.ts`, `.d.mts` and `.d.cts` under `src/`, `functions/`,
`scripts/`, `db/` and `tests/`) with it off. It loads no `@types` package (`"types": []`), so the
only third-party declarations in its program are the ones those files import (React's,
csstype's, PostCSS's and source-map-js's), which check clean; an error in any of them fails
it. `tests/unit/config/typecheck-coverage.test.ts` fails on a declaration file under those
folders that no project `pnpm run typecheck` runs checks with `skipLibCheck` off. The two at
the root are generated, `next-env.d.ts` by Next.js and `cloudflare-env.d.ts` by
`wrangler types`, and stay out: `cloudflare-env.d.ts` names the build output
(`./.open-next/worker`), which exists only after `opennextjs-cloudflare build`.

Scripts are TypeScript too, run with tsx's loader (`node --import tsx scripts/<name>.ts`), and
ESLint loads `eslint.config.ts`, `eslint.type-aware.config.ts` and the rules in
`scripts/eslint-rules/` through jiti, so the node project type-checks all of them and the
type-aware lint rules read them. `tests/unit/config/typecheck-coverage.test.ts` fails on a `.js`,
`.mjs`, `.cjs`, `.d.mts` or `.d.cts` file under `scripts/`, unless a root config that its tool reads
without a TypeScript loader (`.dependency-cruiser.cjs`, `postcss.config.js`) imports it. It tells
that from the config's own imports, not from a list of files ([writing
scripts](development-environment.md#writing-scripts)).

`pnpm run lint` runs ESLint with `eslint.type-aware.config.ts`: everything in
`eslint.config.ts`, plus the `@typescript-eslint/no-unsafe-*` rules and
`@typescript-eslint/no-unsafe-type-assertion` on app, API, script and database code and every
test file ([repository checks](#repository-checks)).
- `TYPE_CHECKED_AREAS` in that config gives each area the one TypeScript project that types
  it: `src` the app's `tsconfig.json`, `functions` and `db` `functions/tsconfig.json` (the
  Workers types), `scripts` `tsconfig.node.json`, and `tests` `tests/tsconfig.json`.
- `scripts/lint.ts` runs ESLint once per area, then once over every other file with the
  areas left out (`lintRuns()` in `scripts/lib/lint-runs.ts`), so each process holds one
  project.
  - In one process the four projects needed over 3 GB of heap, more than Node's default
    limit on CI's runner, and CI's lint ran out of memory. Each run now fits in 2 GB.
  - The API is also typed by its own project now, not by the app's, which happens to
    include some API files through imports. So lint reads a request body's chunks as the
    Workers types give them, not as the browser's.
- A run takes about 85 s against 22 s for `eslint .` on the owner's machine. So the
  pre-commit hook and editors use `eslint.config.ts` alone, and the type-aware rules fail at
  `pnpm run verify` (the push hook) and in CI.
- `tests/unit/config/external-data-boundaries.test.ts` fails if an area loses its project or
  its run.

`eslint.config.ts` holds every `.js`, `.mjs` and `.cjs` file to ESLint's recommended JavaScript
rules (`js.configs.recommended`), `no-undef` among them: TypeScript does not check these files (the
root configs only JavaScript can load, and tests of what a JavaScript caller may pass),
so a name nothing defines would otherwise fail only as a `ReferenceError` when the line runs.
They are Node code, so their globals are Node's: browser globals such as `window` and
`document` are off, and so are CommonJS's wrapper variables (`require`, `module`, `exports`,
`__dirname`) everywhere but `.cjs` files, which parse as CommonJS.
`tests/unit/config/javascript-recommended-rules.test.ts` lints samples to show each part holds.

Lefthook hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. The commit hooks read only the staged
files, so they stay fast; the push hook runs the full gate. Each commit hook starts `node`
directly, never a `pnpm`, `npx` or `yarn` shim: lefthook splits a long `{staged_files}` list
into batches, but on Windows a shim runs through `cmd.exe`, whose 8,191-character command line a
large commit (a promotion merge staging thousands of files) overflows
(`tests/unit/config/lefthook.test.ts`).

Local checks are kept light, so the machine stays usable while they run:
- `scripts/run-at-low-priority.ts` starts the push hook's `pnpm run verify`, and any heavy
  local run such as `pnpm run test:e2e:full <specs>`, at below-normal CPU priority.
  - It also confines itself to one in four CPU threads before it starts the command
    (`cpuCapCommand` in `scripts/lib/cpu-cap.ts`): Windows through the process affinity,
    Linux through `taskset`.
  - Every process the command starts inherits both, so other programs get the CPU first,
    and a production build or a browser test cannot load every core. Priority alone does
    not stop that when nothing else wants the CPU.
- On a developer machine, Vitest runs one worker per four CPU threads (`testWorkerLimit` in
  `scripts/lib/local-test-workers.ts`, set in `vitest.config.ts`).
  - Its default, one worker per thread minus one, meant 31 workers on a 32-thread PC, each
    with its own happy-dom. That used every core and several gigabytes, for no gain: the
    unit suite takes about as long with two workers.
  - CI keeps Vitest's default, because its runners have few cores and nothing else to run.
  - `--maxWorkers` on the command line overrides it.
- `tests/unit/scripts/local-checks-load.test.ts` holds both.

The browser tests workflow checks
out the full git history (`fetch-depth: 0`), since the build dates sitemap entries from
`git log`. When a CI failure looks flaky,
re-run once. If it fails again, treat it as real, and record genuinely flaky tests
in the [tech debt tracker](../tech-debt.md).

## Repository checks

- **Bug fixes carry a regression test.**
  - `scripts/check-fix-commits.ts` refuses a `fix:` commit (any Conventional Commits fix,
    scoped or breaking) that changes no test: no file under `tests/`, and no `.test.` or
    `.spec.` file beside the code.
  - It runs twice:
    - in the Lefthook commit-msg hook (`--commit-msg`), on the staged files;
    - in CI's Quality Gate on a pull request (`--range origin/staging..<head>`), on every
      commit but merges that `staging` does not hold yet. For a pull request into `staging`
      that is the whole pull request; a promotion into `main` adds only its merge commit, since
      `staging` already accepted every commit it carries (some of them, such as two from before
      this rule, would fail it). That step needs the full history, so the Quality Gate checks
      out with `fetch-depth: 0`.
  - A commit that fixes no behavior takes another type: `refactor:`, `build:`, `docs:`,
    `test:` or `chore:`.
- **Docs** (`pnpm run docs:check`, part of `check:repo`) reads `AGENTS.md`, `ARCHITECTURE.md`,
  `README.md`, every Markdown file under `docs/`, and the skills in `.claude/skills/`. It fails
  when:
  - another Markdown file sits at the root (a gitignored one may), or `docs/` holds anything
    but `design-docs`, `exec-plans`, `generated`, `product-specs`, `references` and the
    guides in it today;
  - a relative link, or an anchor into a Markdown file, does not resolve;
  - a backticked repository path (one starting with `src/`, `functions/`, `scripts/`, `db/`,
    `tests/`, `docs/`, `.github/`, `.claude/` or `.mcp.json`) does not exist, or names a
    folder holding no file git tracks, which a fresh checkout would lack. Text with a glob,
    a placeholder, a space or `...` is not read as a path, and a path git ignores (test
    output, logs) may be missing: it is made at runtime;
  - a `pnpm run <script>`, in prose or in a code block, names no script in `package.json`;
  - a page under `docs/` cannot be reached by links from `AGENTS.md` or `README.md`;
  - a design doc is missing from `docs/agents` or its row lacks a status and a
    last-verified date, or a product spec is missing from `docs/product/index.md`;
  - a skill folder has no `SKILL.md`, its frontmatter `name` is not the folder's name, its
    description is missing or longer than 1,024 characters (the Agent Skills limit; Claude
    reads the description to decide when to load the skill), or the skills table in the
    [agent workflow](agent-tooling.md#agent-tooling) does not list it;
  - `AGENTS.md` grows past 120 lines: it stays a map.
- **Comments** are not allowed in any file: a name, a test named for the behavior, or the
  doc that owns the area holds what one would say. Two checks enforce it, and a test keeps
  them complete.
  - ESLint's `serplists/no-comments` rule (`scripts/eslint-rules/no-comments.ts`) reports
    every comment in every TypeScript and JavaScript file but a shebang: JSDoc, comments
    inside JSX, and directives (`eslint-disable`, `@ts-expect-error`, `/// <reference>`,
    `/* global */`). The config sets `noInlineConfig`, so an `eslint-disable` comment cannot
    hide one.
  - `pnpm run comments:check` (`scripts/check-no-comments.ts`, part of `check:repo`) checks
    every other format in every file git tracks or would track, and the pre-commit hook runs
    it on the staged files of those formats (`node --import tsx scripts/check-no-comments.ts <files>`
    checks the files named). It reads each format by its own rules for strings, so a `#` in
    a URL or a `--` in a quoted name is not a comment:
    - YAML through the `yaml` package's parser. In GitHub workflows and actions and the
      Lefthook config, `run:` blocks are read as code too: `bash` and `sh` steps by a shell
      scanner (a `#` starts a comment only at the start of a word, outside quotes,
      substitutions, heredocs and `${{ }}` expressions), `node` steps as JavaScript, and steps
      in other shells not at all.
    - TOML outside basic, literal and multi-line strings; SQL's `--` and `/* */` outside
      strings and quoted names (`"name"`, backticks, `[name]`); CSS through PostCSS's
      tokenizer (strings and `url()` hold no comments); JSON and JSONC through TypeScript's
      scanner; XML (`.xml`, `.xsd`, `.svg`) outside CDATA and processing instructions;
      Markdown's HTML comments (`<!-- -->`), outside fenced code and code spans, so a doc can
      still show one as an example.
    - Dotenv files (`.dev.vars*`, `.env*`): `#` lines, and a `#` after a value, which dotenv
      drops from an unquoted value. `.gitignore`: lines that start with `#`. `.gitattributes`:
      lines whose first character after any spaces is `#`. `.npmrc`: `#` and `;` lines, and an
      unescaped `#` or `;` that ends an unquoted value, as npm reads it.
    - In a patch, only the lines it adds, in the language of the file it patches, reported at
      their line in the patch.
  - `tests/unit/scripts/comment-check-coverage.test.ts` fails on any file in the repository no
    check covers. Each must be TypeScript or JavaScript that ESLint holds to the rule, a format
    `comments:check` reads, a file a generator writes (`GENERATED_FILES` in
    `scripts/check-no-comments-lib.ts`: the lockfile, `cloudflare-env.d.ts`, the portable
    template JSON Schema, the bundled sitemap catalog, and the example templates'
    `template.json` and `preview.html`), or a format without comment syntax
    (`FORMATS_WITHOUT_COMMENTS`: plain text, `.gitkeep`, images, fonts and archives). So a new
    format fails it until the check reads it or one of those lists names it. The test also
    fails if `check:repo` or the pre-commit hook stops running `comments:check`, or if the
    hook's glob misses a file the check reads. ESLint ignores the generated
    `cloudflare-env.d.ts` and `next-env.d.ts`.
  - Nothing is skipped: every workflow is read, the Claude review and weekly maintenance
    workflows included, and the coverage test fails if one has a comment.
- **Duplicated code.** `pnpm run duplicates:check` (part of `check:repo`) runs jscpd over
  `src/`, `functions/`, `scripts/`, `db/` and `tests/` together, with the settings in
  `.jscpd.json`: jscpd's defaults of 50 tokens and 5 lines, a threshold of 0, and exit code
  1, so any clone fails, a clone between app code and a test included. The threshold alone
  would not do: jscpd compares it with a percentage rounded to two decimals, and a small
  clone in a large folder rounds to 0%. A clone is fixed by moving the code into a shared
  helper where both callers may import it (the layer rules in
  [ARCHITECTURE.md](../../ARCHITECTURE.md), and for tests the
  [testing conventions](testing.md#testing-conventions)), never by a higher token count or an ignore.
  Where two blocks look alike but serve different purposes, the shared part becomes one
  function whose parameters name what differs.
  - jscpd reads every file whatever its size (`maxLines` and `maxSize` are far above any
    file) and skips only what git ignores, build output, `db/migrations` and the files in
    `GENERATED_FILES`. It has no tokenizer for XML Schema, so the two sitemaps.org schemas in
    `tests/fixtures/` go unread, and a file under 5 lines cannot hold a clone.
  - The script names the folders (`jscpd src functions scripts db tests`) because jscpd turns
    a `path` in `.jscpd.json` into an absolute path and globs it, and on Windows its
    backslashes make that glob match nothing: the check would pass having read no file.
  - `tests/unit/config/duplicate-check.test.ts` fails if the threshold, exit code, token or
    line count loosens, if `check:repo` stops running the check, the script gains a flag or
    drops one of the five folders, if `.jscpd.json` gains a setting or an ignore beyond
    those, and if jscpd skips a file in the checked folders for any reason but
    `db/migrations`, `GENERATED_FILES`, a missing tokenizer or fewer than 5 lines.
  - `db/migrations` stays out for good: applied migrations are append-only history, and a
    migration that rebuilds a table restates all of it.
- **Dead code.** `pnpm run deadcode:check` (part of `check:repo`, about 3 seconds) runs knip
  with `knip.json` and fails on an unused file, dependency or devDependency, a package or
  binary code uses that `package.json` does not list, an import that does not resolve, an
  unused export, type or enum member, and a value exported under two names. Delete what it
  reports; an export only its own module uses stops being exported. Exports of an entry file
  are not reported, since a framework reads them by name (a route's `GET`, `generateMetadata`
  or `dynamic`).
  - The entry points are what the code runs from. knip's plugins find most of them: the
    Next.js route files and `next.config.ts`; the scripts `package.json`, `lefthook.yml` and
    the workflows run; the Vitest and Playwright configs and their test files; the ESLint
    configs and the rules they import; `.dependency-cruiser.cjs`, the PostCSS config, the
    tsconfigs and `wrangler.toml`. `knip.json` names the rest: `open-next.config.ts`, which
    OpenNext's CLI reads; `scripts/stripe/bootstrap.ts`, which a person runs
    ([billing](billing.md)); `tests/e2e/preview-server.ts`, Playwright's
    `webServer` command; `tests/support/nextFontGoogle.ts`, the module Vitest aliases
    `next/font/google` to; and `db/drizzle.config.ts`, which `db:generate` passes to
    drizzle-kit by path.
  - Test files are entry points, so an export that only tests import passes the check.
  - It ignores two things knip cannot see used: `@secretlint/secretlint-rule-preset-recommend`,
    which secretlint loads by name from `.secretlintrc.json`, and the `stripe` binary, the
    Stripe CLI installed outside npm. `treatConfigHintsAsErrors` fails the check on an entry
    pattern that matches no file and on an ignore nothing needs, so the lists only shrink. A
    JSDoc tag such as `@public` would hide an export from knip, but the comment checks refuse
    every comment.
  - `tests/unit/config/dead-code-check.test.ts` fails if `check:repo` stops running the
    check, the script gains a flag, another knip config file appears, or `knip.json` sets
    anything but entry points and those two ignores: no `rules`, `include` or `exclude` that
    turns an issue type off, no other ignore or tag, no negated pattern and no plugin
    turned off.
- **Tests check what code does, not how it is written.** A test that matches the text of the
  code breaks on a harmless refactor and passes when the behavior breaks, so ESLint's
  `serplists/no-source-text-reads` (`scripts/eslint-rules/no-source-text-reads.ts`) refuses,
  in every test file, a `readFileSync`, `readFile` or `createReadStream` of a code file under
  `src/` or `functions/` (JavaScript, TypeScript or CSS), a listing of a folder under them
  (`readdirSync`, `readdir`, `opendir`, `glob`), and a `?raw` import or raw `import.meta.glob`
  of one. It works out the path from string literals, `const`s, template literals,
  `path.join`, `path.resolve`, `new URL(..., import.meta.url)`, `fileURLToPath`, a `for ... of`
  loop over literals, a local arrow function that builds the path, and one level of wrapper
  (`const read = (file) => readFileSync(path.join(root, file))` called with a source path).
  Reading JSON the app ships, the repository's own files as files (line endings, secrets,
  comments, generated output), harness configuration and test fixtures is allowed because
  of what those reads name, not through a list of files. The testing conventions say how to
  test instead.
- **External data is parsed at the boundary.** A cast trusts a guessed shape, so data from
  outside the code is parsed with a Zod schema where it arrives:
  - `serplists/no-external-data-casts` (`scripts/eslint-rules/no-external-data-casts.ts`)
    refuses, in `src/`, `functions/`, `scripts/` and `db/` and in every test file (`tests/`,
    its unit and integration tests, browser specs, support and fixtures, and the tests beside
    the code in `src/`), a cast (`as T` or `<T>`) of
    `JSON.parse(...)`, a response body (`.json()`, awaited or not, and `.json<T>()`), a
    `getItem(...)` result, `event.data` or `message.data`, `request.formData()` or a form's
    `get()`/`getAll()`, Playwright's `postDataJSON()` (a request body the browser sent), every
    `as unknown as T`, and every cast to `never`, which stops the type checker as
    `as unknown as T` does. Widening to `unknown` is allowed. Each message names what to use:
    `apiRequest(endpoint, schema)` for the API, a schema's `parse` or `safeParse` for the rest,
    Drizzle's `$inferSelect` for D1 rows, `apiEnv()` for an environment in a test.
  - The type-aware rules `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`,
    `no-unsafe-return` and `no-unsafe-argument` refuse an `any` flowing on uncast, as in
    `const data: Foo = await response.json()`, in the TypeScript files of the same folders and
    of `tests/`, whose types come from `tests/tsconfig.json` (`eslint.type-aware.config.ts`,
    run by `pnpm run lint`). Every script is TypeScript, so they hold there too; the one
    JavaScript test left is not type-checked, so of these checks only the cast rule reads it,
    beside ESLint's recommended JavaScript rules ([quality gates](#quality-gates)). Tests are
    held to `no-explicit-any` and `no-this-alias` as app code is: no override turns them off for test files.
  - `@typescript-eslint/no-unsafe-type-assertion`, in the same config, folders and test files,
    refuses an `as` that narrows a type, whatever the value: a cast from `unknown` or `any`,
    from a union to one member, or from `string` to a literal. Narrow instead: a type guard, `in`,
    `instanceof`, a Zod parse, `skipToken` for a TanStack query that waits for an id, a guard
    that throws an error naming what is missing, or the null check a Base UI `Select`'s
    `onValueChange` needs. An `as` that widens or names the same type is allowed.
  - Tests parse what they read the same way: response bodies with `readJson(response,
    schema)`, stored JSON columns with `tests/support/storedJson.ts`, and browser specs through
    request helpers that take a schema ([testing conventions](testing.md#testing-conventions)). They
    narrow as app code does, through the helpers the testing conventions list: a handler on an
    element through `handlerOf` or `handlerIn`, a DOM element through `instanceof` or
    `inputNamed`, a SQL expression through `sqlExpression`, a server's port through
    `listeningPort`, and doubles and environments built as the type they stand in for.
  - `tests/unit/scripts/no-external-data-casts-rule.test.ts` covers the rule, and
    `tests/unit/config/external-data-boundaries.test.ts` fails if `pnpm run lint` stops using
    the type-aware config, a folder loses the rules (the assertion rule included), a test file
    loses the cast rule, the `no-unsafe-*` rules or the assertion rule, or a test file gets
    `no-explicit-any` or
    `no-this-alias` turned off.
- **Code conventions.** A rule about how all code is written lives in ESLint, not in a test
  that scans the code:
  - `serplists/restricted-code` (`scripts/eslint-rules/restricted-code.ts`) takes the
    conventions in `scripts/eslint-rules/code-conventions.ts`: each an esquery selector, the
    message saying what to use instead, and the modules that own that code, if any (the one
    module that may import `react-markdown`, read `maxActiveRuns`, listen for storage events,
    touch the clipboard or render `<img>`). It runs with `APP_CONVENTIONS` on `src/`, `API_CONVENTIONS` on
    `functions/`, `SCRIPT_CONVENTIONS` on `scripts/`, `BROWSER_TEST_CONVENTIONS` on
    `tests/e2e/` and `INTEGRATION_TEST_CONVENTIONS` on `tests/integration/`, one rule name per
    folder, so no block overrides another. The browser specs' conventions are the tool-spawn
    one, setup requests through the API helpers rather than a fetch inside `page.evaluate()`,
    and Template paths the e2e stack has ([testing conventions](testing.md#testing-conventions)).
  - `serplists/navigate-while-visit-is-current`
    (`scripts/eslint-rules/navigate-while-visit-is-current.ts`) refuses code in `src/` that
    moves the user outside a page-visit check after an await in an async handler, or in a
    promise's `.then()`, `.catch()` or `.finally()` callback ([frontend
    conventions](frontend.md)).
  - Each rule has RuleTester tests in `tests/unit/scripts/`, and
    `tests/unit/config/code-conventions.test.ts` lints a sample of every convention with the
    real config, in the folder it covers and in the module that owns it.
- **Naming conventions.** `@typescript-eslint/naming-convention` holds every TypeScript file,
  tests included, to `NAMING_CONVENTIONS` (`scripts/eslint-rules/naming-conventions.ts`). It
  is set once in `eslint.config.ts` for `**/*.{ts,tsx,mts,cts}` and needs no type information,
  so the pre-commit hook runs it too. A name's case says what it holds:
  - variables, functions, parameters and default or namespace imports are camelCase, or
    PascalCase when they hold a React component, a context or a class (`const Icon = ...`,
    `({ as: Heading })`). Types, interfaces, classes, enums and type parameters are PascalCase;
  - UPPER_CASE is only for a `const` at module scope. A name all in capitals counts as
    UPPER_CASE, not PascalCase, so `SELF` inside a function fails like `MAX_ROWS` does: move
    a true constant to module scope, or name a local value in camelCase;
  - a leading underscore marks only a parameter kept for its type, as no-unused-vars'
    `argsIgnorePattern` does. A field left out of a rest object keeps its own name
    (`const { items, ...fields } = section`), since `ignoreRestSiblings` already accepts it,
    or a camelCase one where that name is taken or the key is computed. No name ends in `_`;
  - names that mirror external data are not checked: object literal properties and methods,
    type properties and methods, enum members and destructured names. They carry D1 columns,
    JSON fields, HTTP headers, env vars and MCP tool and field names. Named imports keep the
    exporter's names, and the rule does not read them;
  - names another module gives are matched by name, never by file: the HTTP method functions
    a Next.js route module exports (`GET`, `POST` and the rest). A stand-in for another
    module declares camelCase values and exports them under that module's names
    (`export { geistMono as Geist_Mono }` in `tests/support/nextFontGoogle.ts`);
  - Drizzle tables are camelCase exports that hold their SQL names
    ([database operations](database-operations.md#schema-ownership)).
  - `tests/unit/config/naming-conventions.test.ts` lints a sample of each case with the real
    config, and `tests/unit/config/no-exceptions.test.ts` fails if a TypeScript file is held to
    other options in `eslint.config.ts` or `eslint.type-aware.config.ts`.
- **Scripts are TypeScript.** Every script, the ESLint configs and the ESLint rules are
  type-checked in the node project and read by the type-aware lint rules.
  `tests/unit/config/typecheck-coverage.test.ts` fails on JavaScript, or a declaration file
  written for it, under `scripts/`, unless a root config only JavaScript can load imports it
  ([quality gates](#quality-gates)). The script convention that reads a Stripe secret key only
  through `scripts/stripe/_env.ts` (`SCRIPT_CONVENTIONS`) refuses a bracketed read
  (`env["STRIPE_SECRET_KEY"]`) as well as a dotted one, since `noPropertyAccessFromIndexSignature`
  has TypeScript read the environment with brackets.
