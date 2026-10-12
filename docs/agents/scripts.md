# Writing scripts

How the repository's scripts are written and started, the tools they start, and the line endings
the files they write keep. Running the app and its tests is in
[development environment](development-environment.md).

## Running a script

Scripts are TypeScript, and every one runs in Node with tsx's loader:
`node --import tsx scripts/<name>.ts`, the same in `package.json`, the Lefthook hooks and the
workflows. Code that starts a script calls `execScript()` or `buildScriptInvocation()` from
`scripts/lib/run-tool.ts`, which pass the loader by its absolute URL, so the script may run in any
folder. Why this way:
- Node's own type stripping needs `--experimental-strip-types` before Node 22.18 (the owner's
  machine runs 22.16; CI takes the newest 22 that `.node-version` names), and it only strips: every
  import must name its `.ts` file, so the extensionless imports and the `@/` alias of the app code
  that the seed, sitemap and profiling scripts load do not resolve.
- The `tsx` command runs the script in a second Node process that it starts and relays signals to.
  That takes longer to start, and one process per script keeps Ctrl+C, exit codes and the pid the
  dev launcher records as they were.
- Start-up of `secret-scan` on one file, the pre-commit hook's case, on the owner's machine: 322 ms
  as JavaScript, 365 ms with Node's type stripping, 534 ms with `node --import tsx` and 622 ms with
  the `tsx` command. The hook runs it beside ESLint, which takes about 2.5 s, so a commit takes no
  longer.

tsx looks for `tsconfig.json` from the folder a script runs in, upward, for the `@/` alias; a
script started from a folder outside the checkout that needs the alias gets `TSX_TSCONFIG_PATH`.
ESLint loads `eslint.config.ts`, `eslint.type-aware.config.ts` and the rules in
`scripts/eslint-rules/` through jiti, which ESLint uses for a TypeScript config (ESLint 9.24 and
later); a run on one file takes about 0.2 s longer than with a JavaScript config. So nothing under
`scripts/` is JavaScript, and no declaration file sits beside a script:
`tests/unit/config/typecheck-coverage.test.ts` fails on a `.js`, `.mjs` or `.cjs` file there, or a
`.d.mts` or `.d.cts`, unless a root config that its tool reads without a TypeScript loader imports
it. Those are `.dependency-cruiser.cjs` and `postcss.config.js`; neither imports anything from
`scripts/` today. `scripts/lib/postcss-tokenize.d.ts` declares postcss's tokenizer subpath, which
ships no types, and its tokens stay `unknown` until a Zod schema reads them. The agent hooks and
the ports script are plain Node in `tools/checks/`, since a hook has to start before anything is
installed; each has a `.d.mts` beside it when a test imports it.

Scripts under `scripts/`, `tests/e2e/` and `tests/integration/` start tools through
`scripts/lib/run-tool.ts`: `execTool`/`spawnTool` run a dependency's bin script (wrangler, next,
opennextjs-cloudflare, playwright, drizzle-kit) with the current Node, and `execScript` and
`buildScriptInvocation` run a script with tsx's loader. A new tool gets an entry in
`TOOL_PACKAGES`, naming the package that ships its bin. Never spawn `npx` or `pnpm` by name: on
Windows they are `.cmd` shims, so a spawn without a shell fails with `ENOENT` (or, since Node
18.20.2, `EINVAL` for `npx.cmd`), and passing arguments through a shell lets `cmd.exe` reinterpret
characters such as `&`, `^` and `%` in values like the auth secret. ESLint refuses `npx` or `pnpm`
named as a command in `scripts/`, `tests/e2e/` and `tests/integration/`
(`serplists/restricted-code` with the conventions in `scripts/eslint-rules/code-conventions.ts`),
outside `scripts/lib/run-tool.ts`.

`killPidTree` and `killProcessTree` stop a process with everything it started: on Windows they end
the tree with `taskkill`, since the children (Next.js, workerd) would otherwise keep running and
hold their ports; elsewhere the process gets the signal, which the dev launcher and Wrangler pass
on. `opennextjs-cloudflare preview` itself hands its extra arguments to `wrangler dev` through a
shell without quoting them, so the smoke runner (`buildPreviewArgs` in
`tests/e2e/run-smoke-lib.ts`), `d1:profile` and `pnpm run preview` pass it only plain values, with
no spaces or shell characters.

A script that opens local D1 with Wrangler's `getPlatformProxy()` passes `envFiles` a file that
does not exist (`NO_DEV_VARS_OR_DOTENV_FILES` in `scripts/data/local-d1.ts`): Wrangler reads an
empty list as leave to load `.dev.vars`, and a list of missing files loads neither `.dev.vars` nor
`.env` files.

## Line endings

`.gitattributes` checks every text file out with LF (`* text=auto eol=lf`) and marks fonts and
images as binary, so a Windows clone gets LF even with Git for Windows' default
`core.autocrlf=true`. Generators always write LF. The `--check` scripts (`db:schema:check`,
`schema:portable:check`, `sitemap:check`) and `templates:check` compare through
`scripts/lib/line-endings.ts`, which ignores CRLF versus LF but still fails on any other
difference, including a missing final newline. `tests/unit/scripts/line-endings.test.ts` fails if a
binary file is not marked binary or a CRLF file reaches the index.

A clone made before `.gitattributes` existed keeps its CRLF files until they are checked out again.
Commit or stash your work first, because this discards uncommitted changes:
`git rm -rq --cached . && git reset --hard`.
