# How the checks are set up

[`code.md`](code.md) holds the rules, the check behind each, and where each check runs. This doc
is how the checks are built: the TypeScript projects, the lint areas, what `pnpm run verify` runs,
the git hooks, and the limits that keep local runs light.

## Types

`pnpm run typecheck` runs `next typegen`, then `tsc -p` over five projects: `tsconfig.json`
(`src/` and what it imports), `tsconfig.node.json` (`scripts/`, the skills' scripts in
`.claude/skills/`, and the root config files),
`functions/tsconfig.json` (the API and `db/`, with the Workers types), `tests/tsconfig.json`, which
inherits the app's settings, and `tsconfig.declarations.json` (below). Each adds five settings to
`strict`:

- `noUncheckedIndexedAccess`: an array element or record value read by index may be `undefined`;
- `exactOptionalPropertyTypes`: an optional property takes `undefined` only when its type says
  `prop?: T | undefined`, so a value that reaches JSON, a log line or a spread is left out instead
  of set to `undefined`;
- `noImplicitOverride`: a class member that overrides its base says `override`;
- `noFallthroughCasesInSwitch`: a `case` with statements cannot run on into the next one;
- `noPropertyAccessFromIndexSignature`: a key read with a dot comes from a type that names it, so
  `record.title` on a `Record<string, unknown>` is an error.

Fix an error they report by handling the case it names: narrow the value, give it a default that
is right for that case, or throw an error that says what was missing. Add `| undefined` to an
optional property only where a caller really passes `undefined`. Type a value read by known keys
with the shape it has:

- a Drizzle row (`$inferSelect`, or a `Pick` or `Partial` of it), a Zod output, or the result
  type of the function that built it;
- for stored checklist JSON, the record shapes in `src/lib/schemas/jsonRecords.ts`
  (`SectionRecord`, `TaskRecord`, `ContentRecord`, `SubTaskRecord`), which name the keys the code
  reads, keep every other stored field, and narrow through `isSectionRecord` and the like;
- for any other JSON map read by known keys (MCP tool results, audit metadata, request bodies), an
  interface that extends `JsonRecord` and names those keys as `unknown`, or a Zod object with
  `.passthrough()`. A passthrough object puts the keys it names first, so keep `z.record()` where
  the parsed value's key order is serialized or hashed.

Index with brackets only a dictionary whose keys vary: `process.env` in scripts and configs, a
`dataset`, headers, query parameters. The app's `NEXT_PUBLIC_` variables are declared on
`NodeJS.ProcessEnv` (`src/next-public-env.d.ts`), since Next.js inlines only
`process.env.NAME` read with a dot; the tests' tsconfig includes that file too.

Tests read known keys the same way: a D1 row as `StoredRow` (`tests/support/d1Doubles.ts`, which
the Drizzle chain mocks and `SqliteD1.rows()` use), stored sections through `storedSections`
(`tests/support/storedJson.ts`), a log line through `logLineIn`, an MCP result as `McpRecord`
(`tests/support/mcpResponses.ts`), an element's props as `ElementProps`
(`tests/support/elementTree.ts`), and a response body through the app's schema for it. They index
with brackets only `process.env`, headers, a workflow step's `env` and `with`, an element's
attributes, a log line's event fields, and an audit row's diff and metadata.

No project takes JavaScript into its program: the app's tsconfig sets `allowJs: false` (Next.js
writes its suggested `true` only when the key is missing), the tests' turns it off, and the others
leave TypeScript's default. A test that imports a JavaScript module needs a `.d.mts` beside it.
`skipLibCheck` stays on in the four code projects: without it `tsc` reports more than 1,300 errors
in declaration files the repository can't edit (miniflare's, better-auth's, Drizzle's MySQL and
SingleStore builders, `lib.dom.d.ts` against the Workers types). It skips every declaration file,
the repository's own too, so `tsconfig.declarations.json` checks those under `src/`, `functions/`,
`scripts/`, `db/`, `tests/` and `tools/` with it off. It loads no `@types` package
(`"types": []`), so its only third-party declarations are the ones those files import. The two at
the root are generated and stay out: `next-env.d.ts`, and `cloudflare-env.d.ts`, which names the
build output (`./.open-next/worker`).

Scripts are TypeScript, run with tsx's loader (`node --import tsx scripts/<name>.ts`), and ESLint
loads its configs and `scripts/eslint-rules/` through jiti, so the node project checks them all.
`tests/unit/config/typecheck-coverage.test.ts` fails on a TypeScript file no project includes, a
tsconfig `pnpm run typecheck` doesn't run, one that turns a setting above off or sets `allowJs`, a
declaration file nothing checks with `skipLibCheck` off, and JavaScript outside the places
[`exceptions.md`](exceptions.md) lists.

## Lint

`pnpm run lint` runs ESLint with `eslint.type-aware.config.ts`: everything in `eslint.config.ts`,
plus the `@typescript-eslint/no-unsafe-*` rules and `no-unsafe-type-assertion`.

- `TYPE_CHECKED_AREAS` in that config gives each area the one project that types it: `src` the
  app's, `functions` and `db` the API's, `scripts` and `.claude/skills` the node project, and
  `tests` the tests'.
- `scripts/lint.ts` runs ESLint once per area, then once over every other file with the areas left
  out (`lintRuns()` in `scripts/lib/lint-runs.ts`). In one process the four projects needed over
  3 GB of heap, more than Node's default on CI's runner; each run now fits in 2 GB. The API is
  typed by its own project, so lint reads a request body's chunks as the Workers types give them.
- A run takes about 85 s, against 22 s for `eslint .`, so the pre-commit hook and editors use
  `eslint.config.ts` alone, and the type-aware rules fail at `pnpm run check` and in CI.
- Tests are held to `no-explicit-any` and `no-this-alias` as app code is: no override turns them
  off for test files.
- `tests/unit/config/external-data-boundaries.test.ts` fails if an area loses its project or run,
  or a file loses one of these rules.

ESLint holds every authored JavaScript and TypeScript file to `max-lines` 500, blank lines
included; only the generated files in its global ignores are outside it. It holds every `.js`,
`.mjs` and `.cjs` file to its recommended JavaScript rules, `no-undef` among them, with Node's
globals: no browser globals, and CommonJS's wrapper variables only in `.cjs` files
(`tests/unit/config/javascript-recommended-rules.test.ts`). The script conventions and the cast
rule hold `scripts/`, the skills' scripts, `tools/` and `.github/actions/` alike.

## Repository checks

`pnpm run verify` runs the repository-wide checks in `scripts/checks/`, one after another, on
every file `git ls-files --cached --others --exclude-standard` lists, so a new file is checked
before it is committed and an ignored one never is. It never writes a file. `pnpm run verify
<checks> [paths]` runs some of them on some paths. Each failure prints its findings, then its rule
from `scripts/checks/rules.ts`, the one module the command, the hooks and CI print from.

### Comments

ESLint's `serplists/no-comments` reports every comment in every TypeScript and JavaScript file but
a shebang: JSDoc, comments inside JSX, and directives. The config sets `noInlineConfig`, so an
`eslint-disable` comment can't hide one. `pnpm run verify comments` reads every other format by its
own rules for strings, so a `#` in a URL or a `--` in a quoted name is not a comment:

- YAML through the `yaml` package's parser. In workflows, actions and `lefthook.yml`, `run:` blocks
  are read as code: `bash` and `sh` steps by a shell scanner, and `node` steps as JavaScript.
- TOML outside strings; SQL outside strings and quoted names; CSS through PostCSS's tokenizer; JSON
  and JSONC through TypeScript's scanner; XML outside CDATA; Markdown's `<!-- -->` outside code.
- Dotenv files, `.gitignore`, `.gitattributes` and `.npmrc`, each as its tool reads it; in a patch,
  only the lines it adds, in the language of the file it patches.

`tests/unit/scripts/comment-check-coverage.test.ts` fails on a file neither check reads: each is
code ESLint holds, a format the check reads, a file in `GENERATED_FILES`, or a format with no
comment syntax (`FORMATS_WITHOUT_COMMENTS`: plain text, images, fonts, archives).

### Duplicates

jscpd runs over `duplicateFolders` in `scripts/checks/duplicates.ts` (`src`, `functions`,
`scripts`, `db`, `tests`, `tools`, `.claude/skills` and `.github/actions`) together, with
`.jscpd.json`: 50 tokens and 5 lines, jscpd's defaults, and a threshold of 0, so any clone it finds
fails, one between app code and a test included. It matches clones only within one format, and
reads `.ts`, `.tsx`, `.js` (with `.mjs` and `.cjs`) and `.jsx` files as four, so a block a `.ts`
and a `.tsx` file share passes; in a `.tsx` file it reads the code inside JSX braces apart, as
JavaScript, so repeated JSX can fall short of 50 tokens. Read as one format, as
zenbujapanese-monorepo maps them with `formatsExts`, the code holds 6 clones today
([`harness-debt.md`](../harness-debt.md), Checks). It reads every file whatever its size and skips
only build output, `db/migrations` and the generated files; it has no tokenizer for XML Schema, so
the sitemaps.org schemas in `tests/fixtures/` go unread. The check names the folders on jscpd's
command line because jscpd turns a `path` in its config into an absolute glob, which on Windows
matches nothing. `duplicate-check.test.ts` fails if a setting loosens, a folder drops out, or
jscpd skips a file it could read.

### Dead code

knip runs with `knip.json` and fails on an unused file, dependency or devDependency, a package or
binary the code uses that `package.json` doesn't list, an import that doesn't resolve, an unused
export, type or enum member, and a value exported under two names. An entry file's exports aren't
reported, since a framework reads them by name (a route's `GET`, `generateMetadata`). Its plugins
find most entry points: the Next.js routes and `next.config.ts`, the scripts `package.json`,
`lefthook.yml` and the workflows run, the Vitest and Playwright configs and their tests, the
ESLint configs, `.dependency-cruiser.cjs`, the PostCSS config and `wrangler.toml`. `knip.json`
names the rest, each with its reason in [`exceptions.md`](exceptions.md). Test files are entry
points, so an export only tests use passes. `treatConfigHintsAsErrors` fails on an entry that
matches nothing and an ignore nothing needs. `dead-code-check.test.ts` fails if the check gains a
flag, another knip config appears, or `knip.json` sets anything but entry points and its two
ignores.

### Dependencies

dependency-cruiser cruises `cruisedPaths` in `scripts/checks/dependencies.ts` (`src`, `functions`,
`db` and `next.config.ts`) with `.dependency-cruiser.cjs`, and prints each violation with its
rule's comment (`-T err-long`), which says where the code belongs. The config doesn't follow
`node_modules` but keeps packages in the graph, and excludes only build output and the generated
sitemap catalog. `tests/unit/config/layer-rules.test.ts` builds a tree that follows every layer and
one that breaks each rule, and runs dependency-cruiser on both.

### Generated files

`pnpm run verify generated` runs `schema:portable:check`, `db:schema:check` and `templates:check`,
each of which regenerates its files and compares them with the committed ones, and runs
`wrangler types` on `wrangler.toml` in a scratch folder to compare with `cloudflare-env.d.ts`.
Each failure names the command that writes the file. `pnpm run check:db:drizzle-parity`, in
`pnpm run check` and CI, replays every migration and compares it with the Drizzle schema. Two
generated files stay out of the check: the lockfile, which CI's `pnpm install --frozen-lockfile`
refuses when it doesn't match `package.json`, and the sitemap catalog, which every build writes
again.

### Linters

`pnpm run verify linters` runs actionlint, with ShellCheck on each `run:` block, over the workflows
in the run. It runs the image `actionlintImage` in `scripts/checks/linters.ts` pins by version and
digest, in Docker with no network and the checkout mounted read-only, or an installed `actionlint`
where Docker can't run; with neither it passes on a developer machine and fails in CI
(`tests/unit/scripts/checks/linters.test.ts`).

### Code conventions and names

`serplists/restricted-code` (`scripts/eslint-rules/restricted-code.ts`) takes the conventions in
`scripts/eslint-rules/code-conventions.ts`: each an esquery selector, the message saying what to
use instead, and the modules that own that code. It runs with `APP_CONVENTIONS` on `src/`,
`API_CONVENTIONS` on `functions/`, `SCRIPT_CONVENTIONS` on scripts, skills, `tools/` and actions,
`BROWSER_TEST_CONVENTIONS` on `tests/e2e/` and `INTEGRATION_TEST_CONVENTIONS` on
`tests/integration/`, one rule name per folder, so no block overrides another. Each rule has
RuleTester tests in `tests/unit/scripts/`, and `code-conventions.test.ts` lints a sample of every
convention with the real config.

`@typescript-eslint/naming-convention` holds every TypeScript file to `NAMING_CONVENTIONS`
(`scripts/eslint-rules/naming-conventions.ts`), with no type information, so the pre-commit hook
runs it too. UPPER_CASE is only for a `const` at module scope, and a name all in capitals counts as
UPPER_CASE, not PascalCase. A leading underscore marks only an argument kept for its type, and no
name ends in `_`. Names that mirror external data aren't checked: object literal properties, type
properties, enum members and destructured names, which carry D1 columns, JSON fields, headers, env
vars and MCP names. Names another module gives are matched by name, never by file: the HTTP
method functions a route module exports. Drizzle tables are camelCase exports that hold their SQL
names ([`database-operations.md`](database-operations.md)).

### Test environments

`vitest.config.ts` runs every `*.dom.test.tsx` file in happy-dom, with navigation off so a click
on a link loads nothing, and every other test in Node. `tests/unit/config/test-environment.dom.test.tsx`
fails without `Element` or `matchMedia`, `test-environment.test.ts` fails if a Node test gets a DOM,
and the naming convention refuses the augmentation of React DOM's root container interface that a
hand-written container needs.

### Tests that read source

`serplists/no-source-text-reads` refuses, in every test file, a read of a code file under `src/` or
`functions/` (a `readFileSync`, `readFile` or `createReadStream`), a listing of a folder under them,
and a `?raw` import or raw `import.meta.glob` of one. It works out the path from literals,
`const`s, template literals, `path.join` and `path.resolve`, `new URL(..., import.meta.url)`,
`fileURLToPath`, a `for ... of` loop over literals, and one level of wrapper. Reading JSON the app
ships, the repository's own files as files (line endings, secrets, generated output), harness
configuration and test fixtures is allowed by what those reads name, not by a list of files.

### Fix commits

`scripts/check-fix-commits.ts` refuses a `fix:` commit, any Conventional Commits fix, scoped or
breaking, that changes no test: no file under `tests/`, and no `.test.` or `.spec.` file beside the
code. It runs in the commit-msg hook (`--commit-msg`) on the staged files, and in CI's Quality Gate
(`--range origin/staging..<head>`) on every commit `staging` doesn't hold yet: a promotion into
`main` adds only its merge commit, since `staging` already accepted the rest. That step needs the
full history, so the Quality Gate checks out with `fetch-depth: 0`.

## Git hooks

Lefthook's hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. The commit hooks read only the staged files, so
they stay fast, and the push hook runs `pnpm run verify`. Each hook starts `node` directly, never a
`pnpm`, `npx` or `yarn` shim: lefthook splits a long `{staged_files}` list into batches, but on
Windows a shim runs through `cmd.exe`, whose 8,191-character command line a large commit
overflows (`tests/unit/config/lefthook.test.ts`).

## Local load

Local checks are kept light, so the machine stays usable while they run:

- `scripts/run-at-low-priority.ts` starts the push hook's `pnpm run verify`, and any heavy local
  run such as `pnpm run test:e2e:full <specs>`, at below-normal CPU priority, confined to one in
  four CPU threads (`cpuCapCommand` in `scripts/lib/cpu-cap.ts`: Windows through the process
  affinity, Linux through `taskset`). Every process the command starts inherits both, so a build
  or a browser test can't load every core even when nothing else wants the CPU.
- On a developer machine Vitest runs one worker per four CPU threads (`testWorkerLimit` in
  `scripts/lib/local-test-workers.ts`, set in `vitest.config.ts`). Its default of one per thread
  minus one meant 31 workers, each with its own happy-dom, on a 32-thread PC, for no gain. CI keeps
  the default, and `--maxWorkers` overrides it.
- `tests/unit/scripts/local-checks-load.test.ts` holds both.

When a CI failure looks flaky, run it again once. If it fails again, treat it as real; record a
test that is truly flaky in [`tech-debt.md`](../tech-debt.md).
