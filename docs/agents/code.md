# Code rules and checks

The rules every change follows, and the checks that enforce them. Two beliefs shape them: enforce
invariants, not implementations (boundaries, data shapes and vocabulary are strict, and how code is
written inside them is free), and prefer boring, inspectable dependencies, whose behavior can be
read and tested here, over opaque ones. Each rule says why it exists, how to comply, how an
exception is recorded, and what checks it; each check's failure names its rule here and says how
to fix it. How each check is set up is in [`checks.md`](checks.md).

A change is done when `pnpm run check` passes once on the finished tree, it has the evidence
[`verification.md`](verification.md) asks of its kind of change, and the docs say what changed:
the product doc for a behavior, the area's doc for how it works. The `finish-change` skill walks
an agent through it, with a fresh review of the diff, before it drafts the pull request.

Git hooks, which `pnpm install` installs from [`lefthook.yml`](../../lefthook.yml), check each
commit and push ([Checks](#checks)). Fix what they report, never skip them: CI runs the same checks.

## No comments

Code and config carry no comments, with no exceptions: a comment goes stale without failing
anything. Names say what code does, a step that needs explaining moves into a function named for
it, and why it is built that way goes in the doc [`AGENTS.md`](../../AGENTS.md) routes to for that
area, a product doc or an ADR. A tool directive (`eslint-disable`, `@ts-expect-error`) is a
comment too: configure the tool in its config file. Commented-out code is deleted, since git keeps
it. A shebang may open a script, and Markdown holds no HTML comment, which agents read and people
don't see. The files a tool writes that `GENERATED_FILES` in `scripts/check-no-comments-lib.ts`
lists are left as written. ESLint's `serplists/no-comments` checks every TypeScript and JavaScript
file, with inline config off, and `pnpm run verify comments` every other format, workflows' `run:`
blocks included ([`checks.md`](checks.md), Comments).

## File size

A code file, tests, scripts and config included, has at most 500 lines: an agent loads a whole
file to change one line of it. Split one that outgrows the limit by responsibility, into files
named for what each does. There are no exceptions today; one needs a reason that makes splitting
unsafe now, and goes in `knownLargeFiles` in `scripts/checks/sizes.ts` with its size and that
reason, and may only shrink. Checked by `pnpm run verify sizes` and ESLint's `max-lines`, with no
per-file cap (`tests/unit/config/no-exceptions.test.ts`). The weekly report lists files within 50
lines of the limit.

## Duplicate code

Code says each thing once: a copy drifts, and a fix reaches only one of them. When two places
repeat a block of 5 lines or 50 tokens, tests included, move what they share into one function,
type or test helper named for what it does; where the blocks serve different purposes, its
parameters name what differs. There are no exceptions today; one needs a reason that makes sharing
unsafe now, and goes in `knownDuplicates` in `scripts/checks/known-duplicates.ts` as the pair of
files, their number of blocks and why, and may only shrink. Checked by `pnpm run verify
duplicates`: jscpd over `src`, `functions`, `scripts`, `db`, `tests`, `tools`, `.claude/skills`
and `.github/actions`, applied migrations and generated files aside
(`tests/unit/config/duplicate-check.test.ts`). It compares files of one format at a time, so a
block a `.ts` and a `.tsx` file share passes ([`harness-debt.md`](../harness-debt.md), Checks).

## Dead code

Nothing unused stays: an agent copies or "fixes" dead code as readily as live code. Delete an
unused file, export or dependency, and stop exporting what only its own file uses.

- knip (`pnpm run verify deadcode`) starts from the entry points tools load (the routes, the
  scripts `package.json`, Lefthook and the workflows run, the test, lint and build configs) and
  fails on an unused file, export or dependency, an unlisted package, and an entry or ignore
  nothing needs. When it misses a file a tool loads by path, name that file in `knip.json`, with
  its reason in [`exceptions.md`](exceptions.md), rather than ignoring the finding.
- dependency-cruiser fails on a module in `src/` or `functions/` that no route, no file Next.js
  loads by name and not `next.config.ts` reaches, with no folder exempt; code only a script uses
  lives in `scripts/lib`. ESLint's `no-unused-vars` passes only an argument kept for its type (`_…`)
  and a rest sibling; `dead-code-check.test.ts` and `no-exceptions.test.ts` fail if they loosen.

## Imports

Imports point one way inside each part, and parts meet only where
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) says, so a layer changes and tests without the ones
above it. dependency-cruiser checks the files imports resolve to (`pnpm run verify dependencies`,
rules in `.dependency-cruiser.cjs`), and each failure names its rule and where the code belongs:
every layer ARCHITECTURE.md draws, each proven by an import it refuses
(`tests/unit/config/layer-rules.test.ts`); no cycles, type-only ones included; no test, and no
devDependency for more than its types, imported by code that runs in production. npm packages
stay in the graph, unfollowed, so those rules see them (`dependency-graph.test.ts`). There is no
baseline and every rule is an error (`no-exceptions.test.ts`): move the code, not the rule.

## Types

Everything is TypeScript under `strict` and five stricter settings, since the compiler is the
fastest check an agent gets: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch` and `noPropertyAccessFromIndexSignature` (a key
read with a dot comes from a type that names it). Fix what they report by handling the case:
narrow, give a default that is right for that case, or throw an error naming what is missing.
Never assert: ESLint refuses a `!` everywhere, and an `as` that narrows a type
(`no-unsafe-type-assertion`) in `pnpm run lint`; narrow with a type guard, `in`, `instanceof` or a
Zod parse, and in tests through `tests/support/elements.ts`.

`pnpm run typecheck` runs five projects: the app, the scripts and root configs, the API with
`db/`, the tests, and the declaration files the repository writes, with `skipLibCheck` off.
JavaScript is only for what no TypeScript loader runs ([`exceptions.md`](exceptions.md)), held to
ESLint's recommended rules with Node's globals. `tests/unit/config/typecheck-coverage.test.ts`
fails on a file no project checks, a tsconfig that turns a setting off or takes JavaScript in, and
JavaScript anywhere else ([`checks.md`](checks.md), Types).

## External data

Data from outside the code (request bodies, API answers, JSON, storage, messages, form fields) is
parsed with a Zod schema where it arrives, never cast: a cast or an `any` trusts a guessed shape,
so a changed answer breaks far from where it arrived. The API parses each body from `unknown`
(`functions/api/utils/payloads.ts`), the app's API client parses every answer with its endpoint's
schema (`apiRequest` in `src/lib/api/request.ts`), and tests parse what they read the same way.
ESLint's `serplists/no-external-data-casts` refuses such a cast, `as unknown as` and `as never` in
all code and tests, and the type-aware `no-unsafe-*` rules an `any` flowing on uncast
(`tests/unit/config/external-data-boundaries.test.ts`). There are no exceptions.

## Code conventions

A rule about how all code is written lives in ESLint with what to do instead, so its failure
names the line and the fix. `serplists/restricted-code` takes the conventions in
`scripts/eslint-rules/code-conventions.ts`, each a selector, its message and the modules that own
that code: one way to compute progress, build console paths, render a user's image, launch a tool,
set up a browser spec's data, and more. Toasts come from `sonner`, navigation from
`@/components/navigation/Link` and `useAppRouter` (`navigate-while-visit-is-current` keeps it
inside a page-visit check after an await), and storage from `src/lib/browserStorage.ts`. Names are
camelCase, PascalCase for components and types, UPPER_CASE only for module constants, and a name
that mirrors external data keeps it (`NAMING_CONVENTIONS`). A TSX module in `src/` that exports a
component exports nothing else, so Next.js refreshes it in place. `code-conventions.test.ts` and
`naming-conventions.test.ts` lint a sample of each, and `no-exceptions.test.ts` fails on a file
held to other options.

## D1 queries

D1 bills rows scanned, so a query that loses its `LIMIT` or index costs more as tables grow, long
before it is slow. Bound every query and back it with a matching index ([`d1-cost.md`](d1-cost.md)),
and measure a new or changed one with `pnpm run d1:profile`. Each hot request keeps to its
rows-read budget (`tests/integration/rows-read-budgets-local-d1.test.ts`, in
`pnpm run test:local-d1`). Whether a new query is bounded is held by judgment and `d1:profile`
([`harness-debt.md`](../harness-debt.md), Checks).

## Logging

The API logs through `log(level, 'snake_case_event', { ...fields })` from
`functions/api/utils/logger.ts`: one JSON line per event, with the request's id inside a request
([`observability.md`](observability.md)). Log ids such as `userId`, never emails, tokens or other
personal data. ESLint refuses `console.*` in `functions/` outside the logger, which redacts fields
named `ip`, `email`, `password`, `token`, `authorization` and `cookie`; personal data under another
name is held by judgment ([`harness-debt.md`](../harness-debt.md), Checks).

## Vocabulary

User-visible text uses the product's terms ([`CONTEXT.md`](../../CONTEXT.md)): Organization, not
Team or Workspace; Personal, not "Personal workspace"; the Template Library. Product language
drifts fast, and users meet it on every page. Legacy identifiers in code (`team_id`,
`WorkspaceContext`) mean Organization and stay. ESLint refuses Team, Workspace and the Template
Library's old names in the visible copy of views, components (the UI primitives included) and
features (`no-exceptions.test.ts`); other terms are held by judgment
([`harness-debt.md`](../harness-debt.md), Checks). Changing product wording needs the owner.

## Tests

Tests check what code does, not how it is written, and every test runs. ESLint refuses a skipped,
todo, fixme, conditional or `.only` test, and a file `test:run` leaves out runs in
`test:local-d1` (`no-exceptions.test.ts`). A test that renders uses happy-dom
(`*.dom.test.tsx`), never a hand-written DOM, and other tests run in Node (`vitest.config.ts`,
`test-environment.dom.test.tsx`). No test reads a code file under `src/` or `functions/` as text
(`serplists/no-source-text-reads`): import the module, render the component or send the request,
and assert the outcome. Browser specs set up data through the API helpers and open only Templates
the e2e stack seeds (`tests/unit/e2e/seeded-template-paths.test.ts`). A test is named for the
behavior it checks, which is judgment ([`harness-debt.md`](../harness-debt.md), Checks). How to
write each kind is in [`testing.md`](testing.md).

## Secrets

No credential is committed, whatever the file: git history keeps it after a fix, and everyone with
access can read it. Secrets come from the environment: Wrangler secrets, GitHub Actions secrets,
and the gitignored `.dev.vars` ([`security.md`](security.md)). Secretlint's recommended rules check
every text file (`pnpm run verify secrets`). A test value that only looks like a credential is
changed so it doesn't. If one is committed, have whoever issued it rotate it: deleting the line
isn't enough. There are no exceptions.

## Linters

Workflows lint clean with actionlint, which also runs ShellCheck on their `run:` blocks, at the
version and digest pinned in `scripts/checks/linters.ts` (`pnpm run verify linters`). It runs in
Docker, offline and unable to write the checkout, or as an installed copy; with neither it says so
and passes on this machine, and in CI it fails. Fix what it reports. There are no exceptions.

## Generated files

A file a tool writes matches its source and is never edited by hand: run the command that writes it
and commit the result. `pnpm run verify generated` regenerates each, the lockfile and the sitemap
catalog aside, and fails on a difference, naming the command; CI's `--frozen-lockfile` install holds
the lockfile, and every build writes the catalog again. `pnpm run check:db:drizzle-parity` replays
the migrations against the Drizzle schema ([`checks.md`](checks.md), Generated files).

## Fixes

A bug fix lands with the test that fails without it, so the bug can't come back unnoticed: a file
under `tests/`, or a `.test.` or `.spec.` file beside the code. `scripts/check-fix-commits.ts`
refuses a `fix:` commit that changes no test, in the commit message hook and in CI's Quality Gate
over a pull request's commits, and the `Pull request` workflow refuses such a pull request, titled
`fix:` or from a `fix/` branch ([`ci.md`](ci.md), Pull request). A change nothing can fail without,
such as a typo or a workflow setting, isn't a fix: give it another type, such as `chore`.

## Pull requests

One issue, one branch from `staging` (`<type>/<issue>-<slug>`, kept up to date by merging
`staging` into it), one pull request, small enough to review quickly
([`issue-tracker.md`](issue-tracker.md)). Its title is a Conventional Commit naming the outcome a
user notices, typed `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci` or `chore`.
Its body follows `.github/pull_request_template.md`, starting with `Closes #<number>`, a line per
issue it finishes, or `No issue: <reason>`, and fills in each evidence line. Every review comment
is fixed or answered; agents never merge. The `Pull request` workflow checks that a pull request
into `main` is a promotion, the title, the issue line, the evidence and a fix's test
([`ci.md`](ci.md), Pull request).

## Docs

The docs are the map agents work from, so they stay correct and reachable. `pnpm run verify docs`
fails on: a relative link or heading anchor that doesn't resolve; a repository path, `pnpm` script
or test a doc names in code that doesn't exist (a gitignored file counts as missing, and ADRs skip
the path check); a doc `AGENTS.md` can't reach, outside the layout, or not named in kebab-case; a
skill whose frontmatter doesn't name its folder, whose description passes 1,024 characters, or
that the Skills table below doesn't list; and an HTML comment. Each doc keeps to a budget in lines
wrapped at 100 characters: 120 for a map (`AGENTS.md`, `CLAUDE.md`, the root `README.md`), 300
for any other. Split one that outgrows it by topic. A doc over budget when the check arrived has
an entry in `knownLongDocs` at its size, which may only shrink; `docs/api/` and ADRs have none. A
change to a behavior updates its doc in [`docs/product/`](../product/index.md), with the check that
proves it or the issue that tracks one, in the same pull request. The weekly doc gardener fixes
what drifts anyway ([`ci-agents.md`](ci-agents.md)).

## Fix the harness

When the same problem comes up twice, an owner's correction or a review finding on a second pull
request, fix the harness, not just the symptom: an agent can't remember a correction between
sessions. Make the bad state impossible, make a check fail with the fix in its message, or give
agents one helper to copy, and only then write a rule here: in the same pull request or a
follow-up issue, with a test that fails on the real mistake. Until it is a check, it is a row in
[`harness-debt.md`](../harness-debt.md); the weekly report's Review findings name the repeats.

## Checks

| Check | What it enforces | Where it runs |
| --- | --- | --- |
| `pnpm run verify` | Comments, docs, sizes, secrets, duplicates, dead code, imports, linters, generated files | Pre-push hook, CI's Quality Gate, `pnpm run check` |
| `pnpm run verify <checks> [paths]` | Some of them, on some paths | By hand; the hooks |
| The edit hook (`tools/checks/hook.mjs`) | Comments, size, secrets per file written | Claude Code |
| The stop hook (`stop-hook.mjs`) | The same and the docs, on uncommitted changes | Claude Code |
| The git hooks | Comments, size, secrets and lint on a commit; `verify` on a push | Every clone |
| `pnpm run lint`, `typecheck` | Type-aware ESLint, the five tsc projects | `check`, Quality Gate |
| `pnpm run test:run`, `test:local-d1` | Unit and local D1 tests | `check`, Quality Gate |
| `pnpm run check:db:drizzle-parity` | The migrations match the Drizzle schema | `check`, CI |
| `pnpm run check` | `typecheck:env`, then each of the above in turn | By hand, per finished tree |
| Pull request checks | Only a promotion into `main`, title, closing issue, a fix's test, evidence lines | `Pull request` |
| Browser tests | The whole suite, on the production build | `Browser tests`, each PR |
| Code review | Each push read against these rules (`pr-review`) | `Code review` workflow |
| `pnpm run maintenance:report` | Failures, stale docs and grades, debt, exceptions, files near the limit, review findings | `Weekly maintenance` |

Each pull request workflow, which the merge queue runs again, ends in a job that always reports
(`CI passed`, `Browser tests passed`, `Pull request passed`): the checks a merge can wait for
([`ci.md`](ci.md#checks-a-merge-can-wait-for)).

## Exceptions

A rule is never switched off in the code it flags: an inline directive is a comment, which the
comments check refuses. An exception is an entry in a list beside its check, with its reason, that
can only shrink, or a rule a tool's config turns off or narrows. [`exceptions.md`](exceptions.md)
lists both kinds; add to it in the pull request that makes one. If a rule seems wrong, ask the
owner rather than working around it. `tests/unit/config/no-exceptions.test.ts` fails when a way
around a check comes back: an ESLint suppressions file or flag, a dependency-cruiser baseline or a
rule below `error`, a file a rule's options relax, or a test file no suite runs.

## What needs the owner

Stop and ask before: applying migrations or any write to staging or production D1; anything that
touches live Stripe keys or billing state; deleting user data; changing product wording or
pricing; and changing a rule in this doc. Agents never merge ([`AGENTS.md`](../../AGENTS.md)).

## SERP's standards

This repository follows SERP's standards, from [Agent Harness](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/README.md). Shared practice isn't restated
here: handing work to subagents ([Token Budget](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/token-budget.md)), the prompt a review starts
from ([Review Prompt](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/review-prompt.md)), and cleaning up after merged work
([Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md)). Where this repository differs from a standard, [`AGENTS.md`](../../AGENTS.md) lists
it, and that list wins.

## Skills

Claude Code loads these from `.claude/skills/` when a task matches.

| Skill | Use it to |
| --- | --- |
| [`verify-web`](../../.claude/skills/verify-web/SKILL.md) | Check a page in a real browser |
| [`verify-api`](../../.claude/skills/verify-api/SKILL.md) | Call the API, Run Keys and MCP |
| [`browser-tests`](../../.claude/skills/browser-tests/SKILL.md) | Run and add browser tests |
| [`debug-api`](../../.claude/skills/debug-api/SKILL.md) | Trace what the API did for a request |
| [`pr-review`](../../.claude/skills/pr-review/SKILL.md) | Review a pull request, as CI does |
| [`finish-change`](../../.claude/skills/finish-change/SKILL.md) | Take a change to a pull request |
