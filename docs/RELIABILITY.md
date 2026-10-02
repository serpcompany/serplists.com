# Reliability

How changes are verified, shipped, observed, and recovered. Database environments,
migrations, backups, and R2 storage are in
[design-docs/database-operations.md](design-docs/database-operations.md).

## Principles

- Every check runs in CI, and nothing deploys unless every check passes.
- Deploys fail closed: pending D1 migrations or a failed probe of the new
  deployment stop the release.
- Preview deployments never touch production data.
- Schema changes go through Wrangler migrations only, never ad hoc remote SQL.
- If an incident starts right after a deploy, roll back first and debug second.

## Quality gates

| Where | What runs |
| --- | --- |
| Pre-commit hook | Secret scan, ESLint (`eslint.config.js`, without the type-aware rules) and the comment check on staged files |
| Pre-push hook | `pnpm run verify` |
| `pnpm run verify` | Env contract, lint (type-aware: code conventions, naming conventions, external data parsed at the boundary in app code and tests alike, no narrowing type assertions, ESLint's recommended rules on JavaScript files and tests that read no source text included), `pnpm run typecheck`, covering the app, node, API and tests projects, `check:repo` (secrets, docs, comments, architecture, duplicated code, generated artifacts), unit tests |
| CI Quality Gate | `verify` steps plus the local D1 tests (`test:local-d1`, the rows-read budgets of the hot requests included), the OpenNext build (`build:worker`), and browser tests against it: smoke on every PR, the full suite on PRs into `main` |
| CI schema parity | Replays every migration and compares it with the Drizzle schema |
| Claude code review | Advisory inline review comments on every non-draft PR; never blocks merging ([agent workflow](design-docs/agent-workflow.md#claude-code-review)) |
| Before a release | `pnpm run verify:release` locally; `pnpm run verify:staging` or `pnpm run verify:prod:d1` for remote D1 readiness (needs Cloudflare credentials) |

ESLint's `max-lines` holds every authored JavaScript and TypeScript file
(`**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`: source, tests, browser specs, scripts, seeds and root
config) to 500 lines, blank lines included. Only the generated files in ESLint's global ignores are outside it, and
`tests/unit/config/no-exceptions.test.ts` fails on any other file it misses. Split a file
that grows past the limit by responsibility; `pnpm run maintenance:report` lists the files
at 450 lines or more.

`pnpm run typecheck` runs `next typegen`, then `tsc -p` over four projects: `tsconfig.json`
(`src/` and what it imports), `tsconfig.node.json` (root config and `scripts/`),
`functions/tsconfig.json` (the API and `db/`) and `tests/tsconfig.json`. Each adds four
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
fails when a tsconfig that `pnpm run typecheck` runs turns one of the four settings off. Tests
read what may be missing through the helpers in `tests/support/elements.ts`
([testing conventions](#testing-conventions)).

The app, node and API tsconfigs add a fifth, `noPropertyAccessFromIndexSignature`: a key read
with a dot must come from a type that names it, so `record.title` on a
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
`typecheck-coverage.test.ts` fails when the app, node or API tsconfig turns the setting off.
The tests' tsconfig turns it off until a later round of the
[harness hardening plan](exec-plans/active/harness-hardening.md).

No project takes JavaScript into its program untyped: the app's tsconfig sets `allowJs: false`
(Next.js adds its suggested `allowJs: true` only when the key is missing), the node and API
projects leave it at TypeScript's default of off, and the tests' tsconfig turns it off too.
`skipLibCheck` stays on in every project: without it `tsc` reports more than 1,300 errors in
declaration files the repository cannot edit (miniflare's, better-auth's, Drizzle's MySQL and
SingleStore builders, `lib.dom.d.ts` against the Workers types, the generated
`cloudflare-env.d.ts` and Next.js's `.next/types`). The authored declaration files
(`src/*.d.ts`, the `.d.mts` files beside the scripts) check clean with it off.

`pnpm run lint` runs ESLint with `eslint.type-aware.config.js`: everything in
`eslint.config.js`, plus the `@typescript-eslint/no-unsafe-*` rules, which read types from the
app, API, node and tests projects, and `@typescript-eslint/no-unsafe-type-assertion` on app,
API, script and database code ([repository checks](#repository-checks)). Type information
makes a run about four times as long: 85 to 91 s against 22 s for `eslint .` on the owner's
machine, of which the tests project adds about 35 s (the run took 52 to 54 s without it). So
the pre-commit hook and editors use `eslint.config.js` alone and the type-aware rules fail at
`pnpm run verify` (the push hook) and in CI.

`eslint.config.js` holds every `.js`, `.mjs` and `.cjs` file to ESLint's recommended JavaScript
rules (`js.configs.recommended`), `no-undef` among them: TypeScript does not check these files,
so a name nothing defines would otherwise fail only as a `ReferenceError` when the line runs.
They are Node code, so their globals are Node's: browser globals such as `window` and
`document` are off, and so are CommonJS's wrapper variables (`require`, `module`, `exports`,
`__dirname`) everywhere but `.cjs` files, which parse as CommonJS.
`tests/unit/config/javascript-recommended-rules.test.ts` lints samples to show each part holds.

Lefthook hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. The commit hooks read only the staged
files, so they stay fast; the push hook runs the full gate. The CI Quality Gate checks out
the full git history (`fetch-depth: 0`), since the build dates sitemap entries from
`git log`. When a CI failure looks flaky,
re-run once. If it fails again, treat it as real, and record genuinely flaky tests
in the [tech debt tracker](exec-plans/tech-debt-tracker.md).

### Repository checks

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
  - a design doc is missing from `docs/design-docs/index.md` or its row lacks a status and a
    last-verified date, or a product spec is missing from `docs/product-specs/index.md`;
  - a skill folder has no `SKILL.md`, its frontmatter `name` is not the folder's name, its
    description is missing or longer than 1,024 characters (the Agent Skills limit; Claude
    reads the description to decide when to load the skill), or the skills table in the
    [agent workflow](design-docs/agent-workflow.md#agent-tooling) does not list it;
  - `AGENTS.md` grows past 120 lines: it stays a map.
- **Comments** are not allowed in any file: a name, a test named for the behavior, or the
  doc that owns the area holds what one would say. Two checks enforce it, and a test keeps
  them complete.
  - ESLint's `serplists/no-comments` rule (`scripts/eslint-rules/no-comments.mjs`) reports
    every comment in every TypeScript and JavaScript file but a shebang: JSDoc, comments
    inside JSX, and directives (`eslint-disable`, `@ts-expect-error`, `/// <reference>`,
    `/* global */`). The config sets `noInlineConfig`, so an `eslint-disable` comment cannot
    hide one.
  - `pnpm run comments:check` (`scripts/check-no-comments.mjs`, part of `check:repo`) checks
    every other format in every file git tracks or would track, and the pre-commit hook runs
    it on the staged files of those formats (`node scripts/check-no-comments.mjs <files>`
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
      scanner; XML (`.xml`, `.xsd`, `.svg`) outside CDATA and processing instructions.
    - Dotenv files (`.dev.vars*`, `.env*`): `#` lines, and a `#` after a value, which dotenv
      drops from an unquoted value. `.gitignore`: lines that start with `#`. `.gitattributes`:
      lines whose first character after any spaces is `#`. `.npmrc`: `#` and `;` lines, and an
      unescaped `#` or `;` that ends an unquoted value, as npm reads it.
    - In a patch, only the lines it adds, in the language of the file it patches, reported at
      their line in the patch.
  - `tests/unit/scripts/comment-check-coverage.test.ts` fails on any file in the repository no
    check covers. Each must be TypeScript or JavaScript that ESLint holds to the rule, a format
    `comments:check` reads, a file a generator writes (`GENERATED_FILES` in
    `scripts/check-no-comments-lib.mjs`: the lockfile, `cloudflare-env.d.ts`, the portable
    template JSON Schema, the bundled sitemap catalog, and the example templates'
    `template.json` and `preview.html`), Markdown, or a format without comment syntax
    (`FORMATS_WITHOUT_COMMENTS`: plain text, `.gitkeep`, images, fonts and archives). So a new
    format fails it until the check reads it or one of those lists names it. The test also
    fails if `check:repo` or the pre-commit hook stops running `comments:check`, or if the
    hook's glob misses a file the check reads. ESLint ignores the generated
    `cloudflare-env.d.ts` and `next-env.d.ts`.
  - Until a person removes their comments, `comments:check` skips the workflows in
    `WORKFLOWS_AWAITING_A_PERSON`: agents may not edit CI workflows, so a person has to clean
    them. The test fails once a listed workflow has no comments left, so the list only
    shrinks.
- **Duplicated code.** `pnpm run duplicates:check` (part of `check:repo`) runs jscpd over
  `src/`, `functions/`, `scripts/`, `db/` and `tests/` together, with the settings in
  `.jscpd.json`: jscpd's defaults of 50 tokens and 5 lines, a threshold of 0, and exit code
  1, so any clone fails, a clone between app code and a test included. The threshold alone
  would not do: jscpd compares it with a percentage rounded to two decimals, and a small
  clone in a large folder rounds to 0%. A clone is fixed by moving the code into a shared
  helper where both callers may import it (the layer rules in
  [ARCHITECTURE.md](../ARCHITECTURE.md), and for tests the
  [testing conventions](#testing-conventions)), never by a higher token count or an ignore.
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
- **Tests check what code does, not how it is written.** A test that matches the text of the
  code breaks on a harmless refactor and passes when the behavior breaks, so ESLint's
  `serplists/no-source-text-reads` (`scripts/eslint-rules/no-source-text-reads.mjs`) refuses,
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
  - `serplists/no-external-data-casts` (`scripts/eslint-rules/no-external-data-casts.mjs`)
    refuses, in `src/`, `functions/`, `scripts/` and `db/` and in every test file (`tests/`,
    its unit and integration tests, browser specs, support and fixtures, and the tests beside
    the code in `src/`), a cast (`as T` or `<T>`) of
    `JSON.parse(...)`, a response body (`.json()`, awaited or not, and `.json<T>()`), a
    `getItem(...)` result, `event.data` or `message.data`, `request.formData()` or a form's
    `get()`/`getAll()`, and every `as unknown as T`. Widening to `unknown` is allowed. Each
    message names what to use: `apiRequest(endpoint, schema)` for the API, a schema's
    `parse` or `safeParse` for the rest, Drizzle's `$inferSelect` for D1 rows.
  - The type-aware rules `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`,
    `no-unsafe-return` and `no-unsafe-argument` refuse an `any` flowing on uncast, as in
    `const data: Foo = await response.json()`, in the TypeScript files of the same folders and
    of `tests/`, whose types come from `tests/tsconfig.json` (`eslint.type-aware.config.js`,
    run by `pnpm run lint`). The `.mjs` scripts and tests are not type-checked, so of these
    checks only the cast rule reads them, beside ESLint's recommended JavaScript rules
    ([quality gates](#quality-gates)). Tests are held to `no-explicit-any` and
    `no-this-alias` as app code is: no override turns them off for test files.
  - `@typescript-eslint/no-unsafe-type-assertion`, in the same config and app folders, refuses an
    `as` that narrows a type, whatever the value: a cast from `unknown` or `any`, from a
    union to one member, or from `string` to a literal. Narrow instead: a type guard, `in`,
    `instanceof`, a Zod parse, `skipToken` for a TanStack query that waits for an id, a guard
    that throws an error naming what is missing, or the null check a Base UI `Select`'s
    `onValueChange` needs. An `as` that widens or names the same type is allowed.
  - Tests parse what they read the same way: response bodies with `readJson(response,
    schema)`, stored JSON columns with `tests/support/storedJson.ts`, and browser specs through
    request helpers that take a schema ([testing conventions](#testing-conventions)). The
    assertion rule does not cover tests yet: a later round of the
    [harness hardening plan](exec-plans/active/harness-hardening.md) adds it.
  - `tests/unit/scripts/no-external-data-casts-rule.test.ts` covers the rule, and
    `tests/unit/config/external-data-boundaries.test.ts` fails if `pnpm run lint` stops using
    the type-aware config, a folder loses the rules (the assertion rule included), a test file
    loses the cast rule or the `no-unsafe-*` rules, or a test file gets `no-explicit-any` or
    `no-this-alias` turned off.
- **Code conventions.** A rule about how all code is written lives in ESLint, not in a test
  that scans the code:
  - `serplists/restricted-code` (`scripts/eslint-rules/restricted-code.mjs`) takes the
    conventions in `scripts/eslint-rules/code-conventions.mjs`: each an esquery selector, the
    message saying what to use instead, and the modules that own that code, if any (the one
    module that may import `react-markdown`, read `maxActiveRuns`, listen for storage events,
    touch the clipboard or render `<img>`). It runs with `APP_CONVENTIONS` on `src/`, `API_CONVENTIONS` on
    `functions/`, `SCRIPT_CONVENTIONS` on `scripts/`, `BROWSER_TEST_CONVENTIONS` on
    `tests/e2e/` and `INTEGRATION_TEST_CONVENTIONS` on `tests/integration/`, one rule name per
    folder, so no block overrides another. The browser specs' conventions are the tool-spawn
    one, setup requests through the API helpers rather than a fetch inside `page.evaluate()`,
    and Template paths the e2e stack has ([testing conventions](#testing-conventions)).
  - `serplists/navigate-while-visit-is-current`
    (`scripts/eslint-rules/navigate-while-visit-is-current.mjs`) refuses code in `src/` that
    moves the user outside a page-visit check after an await in an async handler, or in a
    promise's `.then()`, `.catch()` or `.finally()` callback ([frontend
    conventions](FRONTEND.md)).
  - Each rule has RuleTester tests in `tests/unit/scripts/`, and
    `tests/unit/config/code-conventions.test.ts` lints a sample of every convention with the
    real config, in the folder it covers and in the module that owns it.
- **Naming conventions.** `@typescript-eslint/naming-convention` holds every TypeScript file,
  tests included, to `NAMING_CONVENTIONS` (`scripts/eslint-rules/naming-conventions.mjs`). It
  is set once in `eslint.config.js` for `**/*.{ts,tsx,mts,cts}` and needs no type information,
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
    a Next.js route module exports (`GET`, `POST` and the rest), and React DOM's
    `DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_CREATE_ROOT_CONTAINERS`, which the fake DOM
    in `tests/fixtures/fakeDom.ts` augments. A stand-in for another module declares camelCase
    values and exports them under that module's names (`export { geistMono as Geist_Mono }` in
    `tests/support/nextFontGoogle.ts`);
  - Drizzle tables are camelCase exports that hold their SQL names
    ([database operations](design-docs/database-operations.md#schema-ownership)).
  - `tests/unit/config/naming-conventions.test.ts` lints a sample of each case with the real
    config, and `tests/unit/config/no-exceptions.test.ts` fails if a TypeScript file is held to
    other options in `eslint.config.js` or `eslint.type-aware.config.js`.

## Deploy pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and `staging`. A push
to `staging` that passes the Quality Gate and the schema parity check deploys staging, through
`.github/workflows/deploy-staging.yml` (`tests/unit/workflows/deploy-staging.test.ts`).

Nothing deploys production yet. Production moves to Workers at launch
([Next.js migration](exec-plans/active/nextjs-migration.md#left-for-launch)); until then
`serplists.com` keeps serving the last Pages deployment. Staging lives on its Worker's
`workers.dev` address, `https://serp-checklists-preview.serpcompany.workers.dev`.

The staging deploy:

1. validates the env contract with a placeholder `BETTER_AUTH_SECRET`. The real secret is a
   Worker secret: `wrangler secret put BETTER_AUTH_SECRET --env preview`.
2. blocks on pending migrations in staging's D1: `pnpm run verify:staging`.
3. builds the Worker with `SITE_ENV=staging` and `NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED=true`, from
   full git history (`fetch-depth: 0`), because sitemap `lastmod`
   values come from `git log`; a shallow clone would stamp every page with the
   deploy date, so `sitemap:generate` fails on one in CI. Each bundled Template is
   dated by the newest commit on the built branch (first-parent) that changed its
   content, read from the pack history (`scripts/lib/sitemapLastmod.ts`). The
   committed `functions/sitemap/bundled-catalog.generated.json` is never trusted
   for those dates, so a copy generated before an edit was committed cannot keep an
   old date. Content that is not committed yet gets the local build time, kept while it
   stays the same; the previous catalog is read only for that, and for a static page
   git has no date for.
4. runs `opennextjs-cloudflare deploy --env preview`, which uploads the `serp-checklists-preview`
   Worker. The step fails when the output names no `workers.dev` URL, so a deployment is never
   left unchecked.
5. probes the new deployment's `/api/health` (the Worker boots) and `/api/templates` (D1 is
   bound) with `scripts/verify-deployment.mjs`.
   - It tries up to six times, 10 seconds apart, since a new hostname can take a few seconds
     to resolve.
   - A 5xx or no response (DNS, connect, TLS, or a 30-second timeout) fails the run. Other
     statuses, such as an access policy, only warn.
   - The probe follows no redirect, so an access login counts as its redirect status.
6. checks the deployment against the site standards with `scripts/check-site-standards.mjs`.

Settings:

- **Address:** staging answers on its `workers.dev` address, which `STAGING_ORIGIN`
  (`src/lib/seo/siteOrigin.ts`), `scripts/check-site-standards.mjs` and staging's
  `CORS_ALLOWED_ORIGINS` in `wrangler.toml` all name.
- **Database:** the `preview` environment binds `serp-checklists-staging-db`.
- **Secrets:** the Worker has `BETTER_AUTH_SECRET`. Stripe and auth email secrets are not set,
  so billing and password emails show as unavailable on staging (see [SECURITY.md](SECURITY.md)).
- **GitHub secrets:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL` and `CLOUDFLARE_API_KEY`, the
  account email and global key.
- **Indexing:** which environment may be indexed is set by `SITE_ENV` and `next.config.ts`, not
  by the host a request names (see [environments and hosts](#environments-and-hosts)).
- **Actions versions:** keep `actions/checkout` and `actions/setup-node` on v5 or newer. Node is
  pinned to 22.
- **Local API URL:** `pnpm run build` refuses a localhost `NEXT_PUBLIC_API_URL` (unless
  `ALLOW_LOCAL_API_URL=1`), so a local API URL cannot ship.

## Environments and hosts

The app follows the SERP environment configuration standard: configuration is set
explicitly per environment, never inferred from the host.

| Environment | `wrangler.toml` env | `SITE_ENV` | Canonical host |
| --- | --- | --- | --- |
| Production | `production` | `production` | `serplists.com` |
| Staging | `preview` | `staging` | `serp-checklists-preview.serpcompany.workers.dev` |
| Local (`next dev`, `pnpm preview`) | top level | unset | none |

A Wrangler environment inherits no bindings from the top level of `wrangler.toml`, so each
one repeats its D1, R2 and self-reference bindings.

- **Indexing and analytics.** Only a site marked `SITE_ENV=production` may be indexed or
  load analytics ([FRONTEND.md](FRONTEND.md#production-and-other-environments)). Any other
  value, or none, sends `X-Robots-Tag: noindex, nofollow` with every page, API response
  and static file, answers `/robots.txt` with `Disallow: /`, and loads no Tag Manager.
  Canonical URLs name `https://serplists.com` on every environment.
- **Set it in both places.** `SITE_ENV` shapes the build (static pages, the `next.config.ts`
  headers and redirects, `public/_headers`) and what renders on request (the Worker's
  `vars`). Each environment's vars in `wrangler.toml` set it, and each environment's build
  command must set the same value (`SITE_ENV=production pnpm run build:worker`). A build
  without it is non-production, which is the safe default; `scripts/check-env.mjs` rejects a
  value other than `production` or `staging`, so a misspelled `production` cannot quietly
  hide the site from search engines.
- **One host per environment.** `next.config.ts` sends every other host that reaches the
  Worker to the environment's host with a 308, in one hop and in the canonical URL form:
  `www.serplists.com` to `serplists.com`, and the production Worker's `*.workers.dev` URL (and
  its version preview URLs) to `serplists.com`. API paths keep their exact path. Staging has no
  domain of its own yet, so its build skips the workers.dev redirect (`isOnWorkersDev`) and
  serves on its `workers.dev` address. A request with the `x-serplists-smoke-test` header
  skips the workers.dev redirect, so CI can test a production deployment on its workers.dev
  URL; the header is not a secret.
  When adding a host (another custom domain), add its redirect in `next.config.ts` and a
  case in `tests/unit/config/urlStandard.test.ts`.
- **Checking a running site.** `node scripts/check-site-standards.mjs <base-url>
  <staging|production>` checks the URL standard (canonical URLs answer 200, the other form
  308 in one hop, the API is never redirected, the sitemaps list only canonical URLs), the
  environment's robots.txt, `X-Robots-Tag` and Tag Manager, and the host redirects. Against
  a deployed workers.dev URL it sends the smoke-test header, and checks that a request
  without it is redirected. Locally, build with the environment's `SITE_ENV`, serve it with
  `opennextjs-cloudflare preview --env <production|preview> --persist-to <dir>` (after
  `wrangler d1 migrations apply DB --local --env <env> --persist-to <dir>`: an env's local D1
  is a separate database), and pass `--local`, which sends the other hosts as a `Host` header.
  Do not test host rules with an env that has custom-domain `routes`: Wrangler then rewrites
  the `Host` header.

## Observability

- API logs are JSON lines from `log()` in `functions/api/utils/logger.ts`. Every
  request gets a `requestId`, returned as the `X-Request-Id` header. The router handles
  each request inside a context (`functions/api/utils/request-context.ts`,
  `AsyncLocalStorage` under `nodejs_compat`), and `log()` adds that id to every line
  written while the request is handled, D1 profiling lines included, so
  `pnpm run logs:query request <id>` finds all of them. ESLint rejects
  direct `console.*` in `functions/`. Log ids, never emails, tokens, or client IP
  addresses (the router keeps the IP in memory for rate limits only). As a backstop,
  `log()` writes any field named `ip`, `email`, `password`, `token`,
  `authorization`, or `cookie` as `"[redacted]"`, and a field cannot replace the
  `level` or `message` (event name) of the line. It also writes an `Error`-valued
  field as `describeErrorForLog()` output and cuts any string field before
  Drizzle's `\nparams:` section.
- Better Auth's own logs go through `log()` as `better_auth` lines
  (`functions/api/utils/better-auth-logger.ts`), because its default logger prints
  raw emails (`User not found { email }` on every unknown sign-in or reset). The
  text is kept in `detail` with email addresses replaced by `[email]`, objects it
  passes are dropped, and an error keeps only its name and message, cut before
  Drizzle's bound `params:`. Routine user mistakes (unknown email, wrong password,
  repeat sign-up) are logged as `info`, not `error`. Its config leaves Better Auth's
  logger `level` unset: in 1.3.4 an explicit `error`, `warn` or `debug` also prints
  every API error through the default console logger, and the default already
  publishes `info`, `warn` and `error`.
- The router logs each request's path through `sanitizeLogPath()`
  (`functions/api/utils/log-path.ts`), which replaces the secrets some routes carry
  in the URL with `:token`: `auth/reset-password/<token>`,
  `checklists/shared/<shareToken>` and `teams/invites/<token>/accept`. Add any new
  route with a secret in its path there. It splits the path as the handlers do,
  dropping empty segments, and compares them in any letter case, so extra slashes or
  odd casing cannot move a token past it; `teams/invites/pending/...` carries invite
  ids, not secrets, and is logged as it is. Cloudflare's own request metadata still
  records the full URL, so limit who can read the runtime logs.
- Handlers that catch their own errors must log them: the router's `api_error`
  line only sees errors that reach it. Log errors with `...describeErrorForLog(error)`
  (fields `errorName` and `errorMessage`), which drops the bound parameters (user
  content, emails, share and reset tokens) that Drizzle puts in a failed query's
  message and logs the D1 error it wraps instead. The router's `api_error` and
  `env_validation_error` lines, the auth email throttle, and the Stripe webhook
  (which also stores that message in `stripe_webhook_events.error`) do this. The
  MCP endpoint (`/api/mcp`) answers tool failures with an HTTP 200 JSON-RPC error,
  so look for its `mcp_tool_error`, `mcp_tool_invariant`, `mcp_auth_error` and
  `mcp_template_reload_error` lines rather than a 5xx status. Every authenticated
  MCP request also logs `mcp_request` with its key id, a tool call `mcp_tool_call`
  with the tool's name, and a key over its limit `mcp_rate_limited`.
- Production: Cloudflare runtime logs for the Pages project. There is no external
  log sink, metrics, traces, or alerting yet.
- Local: `pnpm run dev:all` mirrors its output to `tmp/logs/dev-all.log`, and the browser
  tests' server mirrors its output to `tmp/logs/e2e-server.log`. `pnpm run logs:query`
  answers questions about either log:
  - errors grouped by event and error;
  - requests per route, with 4xx and 5xx counts and p50, p95 and max latency;
  - the slowest requests;
  - one request's lines as a timeline;
  - D1 statements by rows read, when `D1_PROFILE=true`.

  Details and examples are in the
  [development environment](design-docs/development-environment.md#run).
- Frontend: `ErrorBoundary` (the page-level `RouteErrorBoundary` and the last-resort
  one in `App.tsx`, see [FRONTEND.md](FRONTEND.md#structure)) and analytics
  (`src/lib/analytics.ts`, in-memory) write to the browser console only.
- Weekly maintenance (`.github/workflows/maintenance.yml`): a Claude doc-gardening
  agent opens a PR fixing docs that drifted from the code, and a report of recorded
  debt is posted as an issue (`pnpm run maintenance:report`).

## Incident response

Fast triage (5 minutes):

1. Decide whether the problem is frontend-only or API-only; `GET /api/health`
   confirms the Functions respond.
2. Check the Cloudflare runtime logs and collect `X-Request-Id` values from
   failing responses.
3. If the incident started right after a deploy, roll back to the previous Pages
   deployment first.

Common failures:

- **Login loops or 401s:** confirm requests send cookies (`credentials: "include"`)
  and CORS allows credentials for the right origin (`FRONTEND_URL`,
  `CORS_ALLOWED_ORIGINS`). Rotating `BETTER_AUTH_SECRET` invalidates all sessions.
- **All `/api/*` return Cloudflare 1101:** the auth secret is missing or under 32
  characters, or a URL setting is malformed. Validate with `pnpm run typecheck:env`.
- **500s on templates or runs:** check recent migrations and deploys. For recovery,
  prefer D1 Time Travel (see [database operations](design-docs/database-operations.md)).
- **Uploads failing or 404:** confirm the `R2_UPLOADS` binding and bucket name, that
  the requested key exists, and that no lifecycle rule is expiring objects.

## Testing conventions

- Run the smallest relevant test while developing; run `pnpm run verify` before a PR.
- **Test what the code does, never its text.** ESLint refuses a test that reads code under
  `src/` or `functions/` ([repository checks](#repository-checks)). Instead:
  - a page, layout or route file: call it (`AppLayout({ children })`, a page's default export)
    and search the elements it returns (`tests/support/elementTree.ts`), or render it; the root
    layout through `tests/support/rootLayout.ts`;
  - the stylesheet: compile what the root layout imports and read the compiled rules
    (`tests/support/appStylesheet.ts`);
  - data the app ships: import it (a JSON pack, `templatePackModules`);
  - the modules a feature reaches: ask dependency-cruiser's `cruise()`, as
    `tests/unit/scripts/sitemap-implementation-sources.test.ts` does;
  - a column default or a trigger: apply the migrations with `SqliteD1` and read the row back;
  - a rule about how all code is written: a convention in
    `scripts/eslint-rules/code-conventions.mjs`, with a sample in
    `tests/unit/config/code-conventions.test.ts`.
- **Look for shared setup before writing any.** A mock, fixture or browser step that a second
  test needs lives in one of three folders, and `pnpm run duplicates:check` fails on a second
  copy of 5 lines and 50 tokens:
  - `tests/fixtures/`: data and fake objects with the types the code under test receives:
    handler rows (`handlerRows.ts`), Templates and runs (`dashboardTemplate.ts`,
    `launchChecklistTemplate.ts`, `runExecutionFixtures.ts`, `runStartFixtures.ts`),
    workspaces and plans (`workspaces.ts`, `plans.ts`), Run Keys (`agentKeys.ts`), the template
    detail page's API client (`templateDetailApiClient.ts`), the template editor's hooks
    (`templateEditorHooks.ts`), storage (`memoryStorage.ts`), JSON files (`jsonFile.ts`), the
    fake DOM (`fakeDom.ts`) and query clients (`queryClient.ts`).
  - `tests/support/`: modules that mock what the code under test imports, imported before it
    (see the API handler tests below), and harnesses that run it:
    - API handlers: `apiHandlerMocks.ts` and the modules for each area
      (`templatesHandler.ts`, `checklistsHandler.ts`, `teamsHandler.ts`, `agentMcpHandler.ts`,
      `portableTemplatesHandler.ts`), `mockedSession.ts`, `apiEnv.ts`, `apiRouter.ts`,
      `sqlite-d1.ts` for SQL, `d1Doubles.ts` and `r2Bucket.ts` for D1 and R2 stand-ins, and
      `storedJson.ts` to read what a handler stored.
    - Reading what the code under test returns: `readJson.ts`, `mcpResponses.ts`,
      `asymmetricMatchers.ts`, `thrownError.ts`, and `eslintConfig.ts` for an ESLint config's
      rules.
    - Next.js and the server: `mockedNextNavigation.ts`, `mockedServerContext.ts`,
      `builtRoutes.ts` and `sitemapRoutes.ts`.
    - The app's contexts and hooks: `appShellInPlace.tsx` (the auth, Templates and workspace
      contexts around a page), `hookDoubles.ts`, `mockedPersonalWorkspace.ts`,
      `mockedWorkspaceRoles.ts`, `mockedTemplateLibrary.ts`, `mockedDashboardTemplatesModel.ts`, `mockedR2Uploads.ts` and
      `uploadMocks.ts`.
    - Components called without a DOM: `reactHookStubs.ts`, `reactHooksKeptBetweenRenders.ts`,
      `reactHookFormMock.ts`, `hookStateSlots.ts` and `elementTree.ts`.
    - Components on the fake DOM: `aFakeDomForEachTest()` in `fakeDomRoots.ts` installs the
      globals for a file and unmounts each test's roots; `overlaysInPlace.tsx`,
      `confirmDialogInPlace.ts` and `queryClientsPerTest.ts`; and the providers and pages
      ready to mount (`authProviderHarness.tsx`, `templatesProviderHarness.tsx`,
      `checklistRunPage.tsx`, `templateDetailPage.tsx`, `publicTemplatePage.tsx`,
      `categoryPage.tsx`, `teamInvitePage.ts`); a mounted page restored from the back/forward
      cache (`pageRestore.ts`) and a sign-out control that must wait for the server
      (`signOutControl.ts`).
    - The root layout and the stylesheet: `rootLayout.ts` (`rootLayoutOn(siteEnv)`,
      `plainScriptsInTheHead()`) and `appStylesheet.ts`
      (`compileTheStylesheetTheRootLayoutImports()`).
    - Scripts and workflows: `workflowGuards.ts` and `throwawayGitRepository.ts`; ESLint
      rules: `ruleTester.ts`.
  - `tests/e2e/support/`: browser spec steps: signing in and registering (`sign-in.ts`), the
    template editor (`template-editor.ts`), runs (`run-saves.ts`), billing stubs
    (`billing.ts`), API calls (`api-requests.ts`) and the schemas of what they read
    (`api-bodies.ts`), a mocked API (`mocked-api.ts`) and navigation (`navigation.ts`).
- **Tests that make their own git repositories.** The unit test setup (`tests/setup.ts`)
  clears git's repository variables (`GIT_DIR` and the like) before any test runs.
  - Inside a git hook git sets them: the pre-push hook runs `pnpm run verify`, and in a linked
    worktree `GIT_DIR` names that worktree's repository.
  - Without the clearing, a test that runs `git init`, `add` or `commit` in its fixture would
    write into the real repository instead.
  - Scripts that run git in a directory they are given use `withoutGitRepositoryOverrides()`
    from `scripts/lib/git-env.mjs`.
- Every test runs. ESLint refuses `.skip`, `.todo`, `skipIf`, `runIf`, `fixme`, `xit` and a
  `.only` call in Vitest and Playwright files, and a test file excluded from `test:run` must
  be in `test:local-d1` (`tests/unit/config/no-exceptions.test.ts`). A test that cannot pass
  yet is fixed or deleted, never skipped.
- Tests are type-checked like the app; Vitest and Playwright strip types without checking
  them. `tests/tsconfig.json` extends the app's `tsconfig.json`, includes every TypeScript
  file under `tests/` (unit and integration tests, browser specs, support and fixtures) with
  `next-env.d.ts`, `cloudflare-env.d.ts` and `src/js-yaml.d.ts`, and runs in
  `pnpm run typecheck`. It holds the tests to `strict` and the four settings the app's config
  adds, which it inherits ([quality gates](#quality-gates)).
  `tests/unit/config/typecheck-coverage.test.ts` fails when `pnpm run typecheck` runs no
  tsconfig that includes a TypeScript file the repository holds, skips a tsconfig, or runs one
  that turns off any of the four settings. A
  `.tsx` file next to a `.ts` file of the same name is in no include: TypeScript keeps only
  the `.ts` one, so the test names it.
- Read a response body with `readJson(response, schema)` from `tests/support/readJson.ts`,
  which parses it with Zod and returns the schema's output type (`ResponseSchema`, as the
  app's `apiRequest` takes), so the test checks the shape it reads instead of trusting a cast.
  A schema names the fields the test reads and ends each object in `.passthrough()`: a plain
  `z.object()` drops the fields it does not list, and a `toEqual()` on the result would then
  pass for a body with more. The file also holds
  `jsonObject`, `jsonObjects`, the API's error body (`apiErrorBody`, from `jsonError()` and
  `authJsonError()`) and Better Auth's (`betterAuthErrorBody`). A test that only compares the
  whole body may pass `await response.json()` straight to `expect()`.
  - The MCP endpoint's JSON-RPC bodies, tool results and paged lists have schemas in
    `tests/support/mcpResponses.ts`; `toolBody()` and `rpcErrorBody()`
    (`tests/support/agentMcpHandler.ts`) and `callToolWithAFreshRunKey()`
    (`tests/support/agentMcpOnSqlite.ts`) read with them. A field of a JSON record is read with
    `recordIn`, `recordsIn`, `optionalRecordIn`, `textIn` or `numberIn` from the same file,
    never with `as JsonRecord`. These parse a copy, so a test that changes an object in place
    keeps its own reference to it.
  - What a handler stored (a D1 row's `items`, `retired_items` or audit JSON, a log line) is
    parsed with `tests/support/storedJson.ts`: `storedSectionsIn(column)` for checklist
    sections, `jsonRecordIn` and `jsonRecordsIn` for other JSON, and `parseJsonText(text,
    schema)` for any other shape. The Drizzle chain mocks (`tests/support/drizzleChainMocks.ts`)
    record each `set()` and `values()` row as `Record<string, unknown>`, so a test reads a
    stored column through these instead of trusting `any`.
  - Browser specs run in Playwright, which cannot load Vitest, so they import only modules
    that do not import Vitest. The request helpers in `tests/e2e/support/api-requests.ts`
    take a schema, as `readJson()` does: `apiRequest(page, path, schema, init)`,
    `apiJson(page, path, schema, init)` and `apiJsonAt(page, path, method, schema, body)`
    parse the body with it, and `apiRecord()` parses a JSON record. Each call passes the
    app's schema for the body it reads (`createdRunSchema`, `savedTemplateSchema`,
    `apiRunSchema`, `runShareCreatedSchema` and others, re-exported from
    `tests/e2e/support/api-bodies.ts`, whose modules import only Zod), a schema of its own, or
    `bodyNotRead` when it reads only the status. `sectionsOfStoredItems(run.items)` in the same
    file parses a run's stored sections.
  - An asymmetric matcher inside an expected object comes from
    `tests/support/asymmetricMatchers.ts` (`objectContaining`, `stringMatching`,
    `anyInstanceOf` and the rest), typed `unknown`: Vitest types `expect.objectContaining()`
    and its kin as `any`, which `no-unsafe-assignment` refuses as an object property. An error
    a test matches by its fields is read with `errorThrownBy(action)` from
    `tests/support/thrownError.ts`.
- Fixtures and mocks have the types of what the code under test receives, with no casts:
  - `apiEnv(vars)` (`tests/support/apiEnv.ts`) is a complete `Env`. Its `DB` and
    `R2_UPLOADS` throw, naming the binding, when the code under test uses them; pass the one
    it needs (a `SqliteD1` binding, an `InMemoryR2Bucket` from `tests/support/r2Bucket.ts`) in
    `vars`. A var a test leaves out is left out with `withoutVars(env, names)`, not set to
    `undefined`; a D1 that fails is a `D1DatabaseThatThrows`. The local D1 harnesses
    (`tests/integration/local-d1-handler-env.ts`, `tests/support/personalRunMcpLocalD1.ts`)
    hand handlers an `Env` built the same way.
  - A test double of a platform type implements it. `SqliteD1` implements `D1Database`, its
    statements extend `D1StatementDouble` from `tests/support/d1Doubles.ts`, and a D1 fake with
    canned answers extends `D1StatementDouble` and `D1DatabaseDouble` from the same file;
    `InMemoryR2Bucket` implements `R2Bucket`. D1's `all<T>()`, `first<T>()` and `raw<T>()` and
    R2's `json<T>()` promise a row type nothing checks, in the platform as in the doubles, so
    the doubles declare those generic signatures as overloads over an implementation that
    returns what it read. A `Request` that must hand over a form as is subclasses `Request`.
  - React DOM's `createRoot` accepts the fake DOM's `FakeElement` in the tests' program:
    `tests/fixtures/fakeDom.ts` adds it to the `Container` type React's types leave open for
    that. A component's React props on a fake element are read with
    `typeThroughTheFieldsOwnOnChange()` (`tests/support/fakeDomRoots.ts`).
  - A hook mocked with `vi.mock` gets a typed mock: `vi.fn<HookDouble<typeof useHook>>()`
    (`tests/support/hookDoubles.ts`) returns a `Partial` of the hook's result, so each field a
    test sets is checked against the hook while the rest stay out.
  - A fixture sets every field its type requires, even one the code under test ignores. A
    mock gets the parameters it is called with (`vi.fn((options: BetterAuthOptions) => ...)`),
    so `mock.calls` is typed, and a stand-in for a client has every method of the client's
    type (`runExecutionApiClient()` in `tests/fixtures/runExecutionFixtures.ts`).
  - Narrow a value with Vitest's `assert.exists()`, which fails the test and narrows the
    type, never with `!`, which ESLint refuses. `findElementOf(tree, Component)`
    (`tests/support/elementTree.ts`) finds a component's element with its props typed.
  - Read an element, record value or regular expression group that may be missing through
    `tests/support/elements.ts`: `firstOf`, `lastOf`, `elementAt`, `onlyElement`, `valueAt`,
    `capturedGroup` and `present` (a value in an expression), and for checklists `sectionAt`,
    `taskAt`, `taskIn`, `contentAt` and `subTaskAt`. Each returns the value typed as present or
    throws a `MissingElementError` that says what was missing, so a test that indexes into a
    result fails by name instead of with a `TypeError`. The module imports nothing, so browser
    specs use it too; code inside `page.evaluate()`, which runs in the page, throws an `Error`
    itself.
  - A request init, a prop or a fixture field with no value is left out
    (`...(body === undefined ? {} : { body })`), not set to `undefined`, as the app's code does.
  - A JavaScript module a test imports gets a declaration file beside it
    (`scripts/lib/run-tool.d.mts`). Without one, TypeScript infers its types from the code,
    and a parameter that defaults to `null` then accepts only `null`. `tests/tsconfig.json`
    turns `allowJs` off, so `pnpm run typecheck` fails on an import that has none.
  - A test of what a JavaScript caller may pass but the declared types rule out is a
    `.test.mjs` file (`tests/unit/scripts/run-tool-from-javascript.test.mjs`). So is a test of
    content stored before the API checked every write, which the types also rule out
    (`tests/unit/components/ContentRenderer-stored-content.test.mjs`,
    `tests/unit/lib/forms/templateEditorForm.storedContent.test.mjs`).
  - In the tests' program `NodeJS.ProcessEnv` requires the Worker vars
    `cloudflare-env.d.ts` declares, so an environment for a child process starts from a
    complete one (`tests/unit/scripts/check-env.test.ts`) or from `process.env`.
- Smoke and e2e suites run against the production build on a local worker, or dedicated
  staging, never production. `tests/e2e/run-smoke.mjs` builds the app with OpenNext
  (skip with `--skip-build`), and Playwright's web server
  (`tests/e2e/preview-server.mjs`) serves it with `opennextjs-cloudflare preview`
  (workerd) on one origin for the pages and the API: `localhost:4173`, or the next free
  port, with D1 state in `.wrangler/smoke-state`. Keep the `localhost` host name;
  mixing `127.0.0.1` drops `SameSite=Lax` cookies. The runner seeds the same directory
  the preview runs on (`PLAYWRIGHT_WRANGLER_PERSIST_TO`) whatever port or URL you preset,
  and a preset `PLAYWRIGHT_WRANGLER_PERSIST_TO` must be a folder inside `.wrangler/`
  other than `.wrangler/state`. It stops if `PLAYWRIGHT_API_URL` is not on the app's
  origin, and seeds nothing for a remote app or with `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`.
- The production build has no dev helpers, so the specs bring their own:
  - Sign in with `loginAsAdmin()` or `loginAs()` from `tests/e2e/support/sign-in.ts`. They
    fill the login form with a seeded user (`fillSignInForm()`, as the Fill buttons do in
    `next dev`), wait for My Templates, where signing in lands, and let its requests finish,
    so the spec's next API call is the only one in flight. They wait for its heading, not
    the Switch context button, which sits in the closed sidebar sheet below `md`, so they
    sign in at any width.
  - Move inside the app without a reload with `navigateInApp()` from
    `tests/e2e/support/navigation.ts`. It calls Next.js's router, which Next.js exposes as
    `window.next.router` for debugging (a synthetic `pushState` only changes the URL), and
    resolves once the new page is on screen, when Next.js changes the address: a second
    navigation sent before that replaces the first, and the page it left never unmounts.
- A spec about what the app keeps in memory between pages (the query cache across a
  sign-out and the next sign-in, the session read right after signing in, a page title
  after a client-side navigation) gets there through the app: `navigateInApp()`, a link or
  a button. `page.goto()` and `page.reload()` start the app afresh, with a new QueryClient
  and a new session read, which hides the bug. Arriving through the app also keeps browser
  Back inside it.
- The browser tests run the production configuration (`E2E_SITE_ENV` in
  `tests/e2e/run-smoke-lib.mjs`): the runner builds with `SITE_ENV=production`, the preview
  gets the same var, and CI's Build step sets it too. Pages are then indexable and load Tag
  Manager, as on `serplists.com`. The runner refuses a build it reuses (`--skip-build`) that
  was made for another environment, since the preview's var alone cannot change what the
  build baked in. Staging's noindex is covered by the unit tests and
  `scripts/check-site-standards.mjs`. `tests/e2e/site-standards.spec.ts` checks the URL
  standard, the production rules and the host redirects (Playwright sends the other hosts
  as a `Host` header).
- A spec that checks a page's own robots rule loads the page as `https://serplists.com`
  with `serveLocalAppAsProduction` in `tests/e2e/route-structure.spec.ts`: Playwright
  answers that origin from the local preview (the built app, its pages and API) and aborts
  every other request, so nothing reaches production or analytics. A page can carry two
  robots tags, its server metadata's and the one it adds in the browser (`NoIndexMeta`), so
  `expectRobots` there checks every one.
- Specs open pages at their canonical URLs (`/dashboard/templates/`, `/login/`); a URL
  without its slash only tests a redirect.
- Browser tests run on one Playwright worker (`playwright.config.ts`): e2e specs share
  one database (TD-11), and one workerd process renders every page and every link
  prefetch, so parallel browsers only queue up behind each other there.
- That database holds only what `seed-test` creates (`db/seeds/local.ts`), plus the
  Templates bundled in `src/data`. A spec that opens `/profile/<user>/<slug>` uses one
  of those or creates its own Template. A literal Template path in `tests/e2e` must name one
  in `E2E_TEMPLATE_PAGES` (and an `/api/templates/slug/<slug>` one in
  `E2E_TEMPLATE_API_SLUGS`, which the API answers only for seeded Templates) in
  `scripts/eslint-rules/code-conventions.mjs`, or ESLint refuses it;
  `tests/unit/e2e/seeded-template-paths.test.ts` checks that seed-test or the bundle has
  every one. A path that must be missing names its user or Template with the `no-such-`
  prefix (`/profile/serp/no-such-template/`), which the rule skips and no seeded or bundled
  name may start with.
- The local app runs on workerd (wrangler's dev server, under the preview), which closes a keep-alive
  connection that has been idle for 5 seconds; a request sent on it at that moment is
  lost. Playwright's request client (`page.request`, the `request` fixture,
  `route.fetch`) keeps idle connections with no limit of its own, so its request
  failed with `socket hang up`. Playwright has no option to stop that, so `playwright.config.ts`,
  which the runner and every worker load, calls `disableRequestKeepAlive()` from
  `tests/e2e/support/request-connections.ts`: it turns keep-alive off on the HTTP agent
  Playwright's request client sends every `http://` request through, so each request gets a
  new connection, which the server reads before any idle timer applies.
  `tests/unit/e2e/request-connections.test.ts` fails if a Playwright upgrade moves that
  agent or stops using it.
- Wrangler's dev proxy (its ProxyWorker) keeps its connections to the worker open the same
  way, and there the risk is not one moment: while the worker is busy (a page render, the API
  calls a page sends at once), its workerd reads no new request and runs no timer, so a
  request that reaches an idle connection in that time can lose to the connection's 5-second
  timer once the worker catches up, even one that arrived a second before it was due. The
  proxy then answers `500` and logs `Network connection lost`; it resends a GET or HEAD itself,
  not a POST, PUT or DELETE (cloudflare/workers-sdk#14641). The invite created right after an
  Organization in `team-invite-flow.spec.ts` was lost this way whenever the machine was busy.
  `patches/wrangler@4.143.0.patch`, which pnpm applies on install (`pnpm.patchedDependencies`
  in `package.json`), puts a relay between the proxy and the worker, in wrangler's own process
  (`wrangler-dist/serplists-user-worker-relay.js`): it sends every request to the worker over a
  new connection, which that timer never applies to, and never closes an idle connection from
  the proxy itself, so nothing is lost and nothing is sent twice. Wrangler's
  `ProxyController` (`wrangler-dist/cli.js`) points the proxy at the relay with each `play`
  message and closes it on teardown, and when a reload moves the worker, the old relay
  finishes the requests it holds and stops. The relay sets no time limits of its own (the
  proxy and workerd keep theirs), tunnels WebSocket upgrades to the worker over a new
  connection, and leaves remote mode (https to a preview host) as it was. When the worker
  cannot take a request, the relay drops the proxy's connection, as a lost connection to the
  worker would, so the proxy's own handling of that (waiting out a reload, resending a GET)
  still applies.
  `tests/unit/e2e/wrangler-proxy-patch.test.ts` fails if a wrangler upgrade leaves the patch
  behind: check whether upstream fixed #14641, and if not, re-create the patch for the new
  version with `pnpm patch wrangler@<version>`, edit the extracted package, and run
  `pnpm patch-commit <dir>`, which also records the patch's new hash in `pnpm-lock.yaml`.
- Specs set up and read their data with `apiRequest()` or `apiJson()` from
  `tests/e2e/support/api-requests.ts`, passing the schema of the body they read (see above):
  they call the API through Playwright's request
  client with the page's cookies, so no CORS preflight runs, no `page.route()` stub catches
  the call, and a failure names the request instead of `TypeError: Failed to fetch`. When
  how the browser itself sends a request is what the test checks (a CORS preflight, say),
  the spec sends it with `fetchFromThePageUnderTest()` from the same file: ESLint refuses a
  fetch inside `page.evaluate()` in any other file under `tests/e2e`.
- `trackApiRequests()` in the same file waits for the page's own requests to finish: the
  several that My Templates sends when signing in lands there, or those before a step that
  must be the page's only request (a save meant to meet an ended session). A page often
  sends its next request only once an earlier one answered, so `settled()` also waits until
  none has started or ended for 300 ms.
- Playwright tries a page's routes newest first, so a mock that must answer before a
  catch-all route (`serveLocalAppAsProduction`, a spec's `**/api/**` mock) is registered
  after it, and calls `route.fallback()` for the requests it leaves to the earlier routes.
- A route handler that passes a request on with `route.fetch()` fails the test when the
  page closes before the answer arrives, so a spec with one unroutes in `afterEach`:
  `page.unrouteAll({ behavior: 'wait' })` lets the request finish (the billing status
  stubs), and `{ behavior: 'ignoreErrors' }` drops it (`serveLocalAppAsProduction`).
- Chromium does not always keep a page in the back/forward cache under test, so a spec
  about what Back restores keeps the page and sends the restore itself: the stubbed
  checkout answers with a same-page hash link, and the spec dispatches the `pageshow` event
  with `persisted: true` that a restore fires (`billing-back-from-checkout.spec.ts`).
- `toBeVisible()` passes for an element at opacity 0, so a spec checks a control that fades
  in on focus or hover by its computed opacity.
- A modal dialog takes the page behind it out of the accessibility tree, so `getByRole()`
  finds nothing there until the spec closes the dialog.
- To test what happens while someone types (focus, a value the page rewrites as it
  changes), type with `pressSequentially()`: `fill()` sets the whole value in one change.
- When a step ends in a navigation that waits for the API (a Save that opens the list), wait
  for that response before checking the URL: on a busy machine the save can take longer than
  an assertion's default 5 seconds.
- `setInputFiles()` does not wait for the input to be enabled, and the page ignores a file
  set on a disabled input, so a spec waits for `toBeEnabled()` first (the import page's
  picker stays disabled until the Template list and the plan load). It also dispatches
  `change` every time, even for the file already chosen, where Chromium would not: a spec
  that checks a file can be chosen again checks that the input is empty after each choice.
- A double click whose second click must land on what the first one changed (the next
  task's button, a dialog that opened) is two `page.mouse` clicks with `clickCount` 1 and 2,
  the `event.detail` the browser reports (`run-double-clicks.spec.ts`). `page.mouse` does not
  scroll, so the spec first scrolls the button into view with
  `scrollIntoView({ block: 'nearest' })`, as a person would: `scrollIntoViewIfNeeded()`
  centres it, which pushes the task title out of view, so moving on to the next task scrolls
  the page from under the pointer. The second click must follow within the 500 ms
  double-click interval, so between the two the spec waits only for an element to exist,
  polled per animation frame: waiting for it to be visible and measuring it took over
  500 ms on a busy machine.
- To trace a failed request to the local API, open wrangler's debug log for that run:
  every session writes one, with timestamps and the API's own `api_request` lines, to
  `.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on
  Windows). Compare it with the times in the test's trace. A reload of the worker
  shows there as `Reloading local server`.
- Reuse stable test identities instead of registering a new account on every run.
  Production auth blocks known test-email domains; keep that coverage when auth
  routes change. A spec that needs a fresh account (an Organization invite, a Free plan
  at its limit) registers one: the stack runs with `wrangler.toml`'s top-level vars, which
  turn email verification off (`AUTH_EMAIL_VERIFICATION_REQUIRED`), so the new account is
  signed in at once and returns to its `next` path.
- Billing is on only where Stripe keys are set, which CI's stack lacks, and without it the
  app offers no upgrade. A spec about the upgrade path reports billing as enabled with
  `reportBillingEnabled()` from `tests/e2e/support/billing.ts` and answers checkout itself,
  so it never reaches Stripe.
- Handler tests assert the public contract, not incidental query order. Request
  the legacy template backup explicitly with `?format=backup`; the default export
  is portable.
- API handler unit tests mock `drizzle-orm/d1` at the adapter boundary with chains of
  `vi.fn()` and keep real schema and query expressions. `drizzleChainMocks()`
  (`tests/support/drizzleChainMocks.ts`) builds the select, insert, update and delete chains
  (an insert's `select` is the `INSERT ... SELECT` of a guarded write) and a `db` that
  returns them, and `chainSelectsUpdatesAndDeletes(dbMocks)` makes `from`, `leftJoin`,
  `where` and `set` chain again whatever an earlier test made them return. Never build a
  chain of your own: import the mocks from the support module that fits, as the first import
  after Vitest's:
  - `tests/support/mockedDrizzleD1.ts` mocks only `drizzle-orm/d1` and exports `dbMocks`, for
    a test of code that reads its own session or entitlements (the entitlements module, Run
    Keys, profiles).
  - `tests/support/apiHandlerMocks.ts` adds the session and entitlements mocks, `mockEnv`,
    the `FREE_PLAN`, `PRO_PLAN` and `TEAM_PLAN` entitlements, and the resets each
    `beforeEach()` starts from: `resetToASignedOutVisitorOnTheFreePlan()`, then
    `signInWithPlans(userId, personalPlan, organizationPlan)`, or both at once with every
    guarded write applied (`resetToASignedInUser()`).
  - `templatesHandler.ts` and `checklistsHandler.ts` add the guarded-insert mock below and
    the response schemas; `agentMcpHandler.ts` and `teamsHandler.ts` hold the MCP and teams
    mocks and fixtures.

  The resets clear every mock, and also `mockReset()` the calls a test queues rows and batch
  results on (`limit`, `orderBy`, `batch`): `vi.clearAllMocks()` keeps the values a test
  queued with `mockResolvedValueOnce()`, so a test that stops early (an early `400`) would
  leave its rows to the next one.

  A test that inspects the rows guarded inserts write (audit events, a new run) mocks
  `@functions/api/utils/guarded-insert` with `guardedInsertsThroughThePlainInsertMock()`
  from `tests/support/guardedInserts.ts`, so they reach the plain insert mock. The guards
  themselves are tested in `audit-guards.test.ts` and the local D1 tests
  (`pnpm run test:local-d1`).

  A support module that calls `vi.mock()` itself works because Vitest hoists the calls to
  the top of that module, so a test file that imports it before the code under test gets the
  mocks in everything it imports after. A value made with `vi.hoisted()` there is exported
  with a separate `export { ... }`, since Vitest refuses `export const x = vi.hoisted(...)`,
  and a value imported from another module is re-exported with `export { x } from`, since
  Vitest's rewrite of the imports leaves a plain `export { x }` naming nothing.

- To run a real handler, Drizzle query or Better Auth's Drizzle adapter on SQL, use `SqliteD1`
  from `tests/support/sqlite-d1.ts`, the one stand-in for D1: a node:sqlite database behind the
  D1 calls Drizzle makes, with foreign keys enforced and every batch a transaction, as on D1
  (`tests/unit/db/sqlite-d1-stand-in.test.ts`). `new SqliteD1()` applies every migration;
  `new SqliteD1({ schemaSql })` applies only the statements a test gives it, for a test that
  needs a few tables (billing, the sitemap queries). Pass its `binding` as `env.DB`.
  - `beforeNextBatch()` commits a competing write just before the handler's next
    `db.batch()`, to test SQL guards and races. See
    `tests/unit/functions/api/teams-sqlite.invites.test.ts`, whose seeded Organization comes
    from `tests/support/teamsSqlite.ts`.
  - `queries` records every statement, and `queryPlan()` returns `EXPLAIN QUERY PLAN` for one.
  - `setStatementHook()` runs before each statement with its SQL and parameters: throwing
    there fails that statement as a D1 outage would (`D1_ERROR: Network connection lost`),
    and `null` removes it.
  - `rows()` and `run()` read and write directly, `sqlite` is the node:sqlite database, and
    `readMigration()` reads one migration's SQL.
  - Its `raw()` reads rows as arrays, which Drizzle maps by column position, through
    `allRowsAsArrays()` (`tests/support/sqliteRowArrays.ts`), which turns on node:sqlite's
    `setReturnArrays()` and parses the rows with Zod.
- `pnpm run test:local-d1` runs the API on real local D1 through wrangler's
  `getPlatformProxy`, with no dev server. `startLocalD1()`
  (`tests/integration/local-d1-handler-env.ts`) applies every migration to a throwaway
  database in its own temp directory and returns the handler env and a `dispose()` that
  removes it. `runToolInRepo()` and `platformProxyOnLocalD1()` there run wrangler or tsx
  from the repository root and open a proxy on a database a test built itself. Each file
  starts its own D1 and takes about 20 seconds, so run a changed one alone:
  `pnpm exec vitest run <file> --testTimeout=20000 --maxWorkers=1`.
- `tests/integration/rows-read-budgets-local-d1.test.ts` (in `test:local-d1`) holds the
  rows-read budget of every hot request, in one table with each budget's reason, and fails
  when a request reads more: a lost `LIMIT` or index shows as a failed budget, not a slow
  test. It takes about 45 seconds. How it measures, and how to update a budget when a route
  is meant to read more, is in [D1 cost](design-docs/d1-cost.md#measuring).
- Billing tests on SQLite build their tables with `billingSchemaSql()` (the users, Stripe and
  entitlement override tables), send checkout and portal requests with `postToBilling()` and
  seed users, customers and subscriptions with the helpers in
  `tests/support/billingCheckout.ts`.
  Webhook tests send `signedWebhookRequest()` from
  `tests/unit/functions/api/support/stripe-webhook.ts`, which signs the event, so the
  handler's own signature check runs.
  A file that checks out more than 10 times a minute for one user mocks `checkRateLimit`
  to allow every request: the per-account limit on checkout and portal (tested in
  `billing-handler.test.ts`) would refuse its later tests.
- MCP tests send their requests with `mcpRequest()` and `mcpToolCall()` from
  `tests/support/agentMcp.ts`. A test that makes more calls than one Run Key may make in a
  minute (`RUN_KEY_REQUESTS_PER_MINUTE`, counted per key in the process) gives each call a
  key of its own with `authenticateWithAFreshRunKey()`, or the limit answers `429`.
  `readTemplateInFull()` (`tests/support/templatePages.ts`) and `readRunInFull()`
  (`tests/support/runPages.ts`) read a template or run the way an agent does, whole when it
  fits, otherwise its outline, each section by id and a run's retired work a page at a time,
  joining the parts of anything too large for one result, to show it can be read in full.
- A test that reads values from the deployed configuration (the CORS allowlists, the auth
  policy, the D1 bindings) takes them from `wrangler.toml` with `wranglerEnvVars(environment)`
  or `readWranglerToml()` from `tests/support/wranglerToml.ts`, so a change to that file is
  tested too. They parse the file with `smol-toml` and then Zod, never with a regular
  expression.
- Unit tests run in UTC: `vitest.config.ts` sets `TZ` before Vitest starts its workers, which
  inherit it, so a date renders the same on every machine and in CI
  (`tests/unit/config/test-environment.test.ts`).
- Unit tests run in Vitest's node environment, with no DOM, jsdom or testing-library, so a
  component test takes one of three routes:
  - Render the component to HTML with `renderToStaticMarkup` and read the markup.
    `tests/unit/components/accessibleMarkup.ts` finds its controls (fields, buttons and any
    element with a widget role) and names them as a screen reader does: `aria-labelledby`,
    `aria-label`, a `<label for>`, or a button's text, never a placeholder.
    `tests/unit/components/focusVisibility.ts` finds a focusable element that is invisible,
    or hidden from assistive tech, while it has focus.
  - Call the component as a function, with React's hooks replaced in `vi.mock('react')`, and
    search the element tree it returns (`tests/support/elementTree.ts`) for handlers and the
    next component's props. A hook test calls the hook the same way, inside a plain function
    component. `tests/support/hookStateSlots.ts` keeps state, refs and effects between calls
    by call order, as React keeps them between renders (`hooksKeptBetweenRenders` replaces
    `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback` and `useSyncExternalStore`
    at once): `renderKeepingState` renders again, an effect runs during the call when its
    dependencies change, and `unmountEffects()` runs the cleanups.
    `createFormControlMountedLikeUseForm` (`tests/support/editorFormControl.ts`) gives the
    template editor a real react-hook-form control.
  - Mount it with React DOM into the fake DOM of `tests/fixtures/fakeDom.ts`
    (`installFakeDomGlobals`, `createFakeContainer`) and drive it with `act()`, `click()` and
    `dispatch()`, when the test needs effects, focus or clicks. `installFakeDomGlobals()`, in
    `beforeAll` with its returned undo in `afterAll`, gives React DOM a window while it commits
    and turns on `act()`; a page that navigates gets the window of the Next.js stand-in
    (below). `click()` and `dispatch()` deliver an event to the container's capture
    listeners, then its bubbling ones, where React DOM listens; a click's `detail` is its click
    count, 2 for the second click of a double click. A hook that needs React's own
    effects or TanStack Query runs the same way, in a probe component that renders nothing.
    React DOM loaded without a DOM listens for the old IE input events, so a test types into a
    field by calling the `onChange` in the props React keeps on the node (`__reactProps$...`).
    React DOM sets an input's `type` and `value` as properties, so read them from the node,
    not its attributes. After unmounting a tree that used TanStack Query, wait one timer tick
    before `afterAll` restores the globals: Query hands React its batched notifications on a
    timer, and React fails on one that runs after the fake window is gone.
    `letQueryUpdatesReachObservers()` (`tests/support/queryNotifications.ts`) waits, inside
    `act()`, the few timer rounds an answer takes to reach the observers and render.

  Base UI's overlays render nothing until they open, and their portals render nothing without
  a DOM, so component tests replace dialogs, alert dialogs, menus and select popups with the
  in-place versions in `tests/support/overlaysInPlace.tsx`. A test that renders a failed query
  statically seeds the failure with `seedQueryError()` on `createTestQueryClient()`
  (`tests/fixtures/queryClient.ts`), which does not retry on mount, so the error shows instead
  of the fetching state of a query about to retry; `data` makes it a refresh that failed after
  a successful load. A static render runs no effects, so a page never counts as shown to
  `usePageVisit` and drops every late result: a test that acts as a user still on the page
  mocks `@/hooks/usePageVisit` with `pageVisitOfAUserStillOnThePage`
  (`tests/support/pageVisitMock.ts`).
- The App Router exists only in a Next.js app, so `tests/support/` stands in for what the
  app imports from Next.js:
  - `nextNavigation.tsx` replaces `next/navigation` and `next/link` with an in-memory
    browser (`inMemoryBrowser.ts`), so the app's `Link`, `useAppRouter` and leave guard run
    for real. `mockedNextNavigation.ts` mocks both modules with it and exports `navigation`;
    import it first, before anything that loads the app:

    ```ts
    import { navigation } from '../../support/mockedNextNavigation';
    ```

    `navigation.reset(url, options)` starts each test (after any `vi.resetAllMocks()`) from
    one entry at a path, or at an absolute URL for another origin. `params` fixes the route's
    params for every URL, enough for static rendering; `routes` lists App Router patterns
    (`/categories/[categorySlug]`) whose params then follow each URL; `before` lists earlier
    entries, oldest first; `state` is the current entry's history state. The stand-in `Link`
    handles a click as `next/link` does (`next/dist/client/app-dir/link.js`): its own
    `onClick` first, a modified click, a download or another origin left to the browser, and
    an `onNavigate` that may cancel; `data-prefetch` shows the `prefetch` prop Next.js would
    get (`unset` for its default). The router's `push` and `replace` add or replace an entry,
    and a navigation to the URL already open replaces it, as in Next.js. `usePathname`,
    `useSearchParams` and `useParams` follow the current entry, including one written with
    `pushState` or `replaceState`. `navigation.router` is what `useRouter()` returns, with
    `vi.fn` methods; `navigation.log` lists each navigation and whether a `Link` or the
    router sent it, and `navigation.documentLoads` each full page load. A test that mounts
    with React DOM installs `navigation.window` (its history and location, events, storage
    and a `confirm()` answering true) with `navigation.installWindow()` or
    `installFakeDomGlobals(navigation.window)`. Back, Forward and `go()` fire `popstate` on a
    later task, as a browser does: `navigation.settle()` lets one run, so a Back the page
    answers with a traversal of its own needs two. `<RoutedPages>` renders the page whose
    pattern matches, remounted for another pattern or other params and kept for the same
    URL or another query, as the App Router does; `renderPageAt()` returns a URL's server
    HTML, with no effects.
  - `nextRouting.ts` loads `next.config.ts`'s redirects and headers as `next build` does for
    a build's `SITE_ENV` (`loadBuiltRoutes()`; `withSiteEnv()` from `siteEnv.ts` sets the
    variable, or leaves it unset for `undefined`) and answers a URL the two ways the app is
    served: `nextServerRedirect()` as `next dev` and `next start` do, and `workerRedirect()`
    through OpenNext's routing in the Worker, for which the test mocks
    `@opennextjs/aws/adapters/config/index.js` with `openNextBuildConfig()`. A request's
    `Host` comes from its URL. `headersFor()` gives the headers a response gets. OpenNext
    publishes `@opennextjs/aws` unbundled, with extensionless imports meant for its own
    bundler, so `vitest.config.ts` inlines it (`server.deps.inline`) for Vite to resolve.
  - `nextServerContext.ts` is what `src/server` reads from Next.js and OpenNext: mock
    `@opennextjs/cloudflare` with `cloudflareMock`, `next/headers` with `headersMock` and
    `server-only` with an empty module, then set `serverContext.env` and the host.
    `createEdgeCache()` is a data center's Cache API
    (`vi.stubGlobal('caches', { default: edgeCache.cache })`) and `unreachableD1` fails every
    query.
  - `next/font/google` is compiled by the Next.js build, so `vitest.config.ts` resolves it
    to `nextFontGoogle.ts`, which returns the shape the root layout reads.
- Coverage settings live under `test.coverage` in `vitest.config.ts`
  (`pnpm run test:coverage`); `@vitest/coverage-v8` must match the Vitest version.
  If you override `test.exclude`, keep `node_modules`, `dist`,
  `playwright-report`, `test-results`, `tests/e2e/**`, and `tmp/**` excluded.
- If production test accounts must be removed, inspect dependent rows first and
  clean auth, templates, runs, likes, analytics, entitlement, and Stripe records
  as one deliberate maintenance operation.
