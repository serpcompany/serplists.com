# Verifying a change

How much to check and when, how to wait, what evidence a change needs, which ports a checkout
uses, and which version of each toolchain everything builds with. The rules are SERP's
[Verification Cadence](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/verification-cadence.md);
this doc holds this repository's commands for them.

## Three levels

| Level | When | What runs |
| --- | --- | --- |
| Inner loop | While editing | The edit hook checks each file as it's written, and the stop hook the whole change before a turn ends ([`code.md`](code.md), Checks). Beside them, the type check of the project you touched and the tests for the changed code, below. |
| Push | Before each push for review | The tests the change touches, browser specs included. The pre-push hook runs `pnpm run verify` at low priority. |
| Finish gate | Once, on the finished tree | `pnpm run check`, then the evidence the change needs (below). The `finish-change` skill walks through it. |

The inner loop, by part:

| Part | Run |
| --- | --- |
| The app (`src/`) | `pnpm exec tsc -p tsconfig.json --noEmit`, and `pnpm exec vitest related --run <files>` |
| The API and the database (`functions/`, `db/`) | `pnpm exec tsc -p functions/tsconfig.json --noEmit`, and `pnpm exec vitest related --run <files>` |
| Scripts, the checks and the root configs | `pnpm exec tsc -p tsconfig.node.json --noEmit`, and `pnpm exec vitest related --run <files>` |
| Tests (`tests/`) | `pnpm exec tsc -p tests/tsconfig.json --noEmit`, about 30 seconds: Vitest and Playwright run a test without checking its types |
| The local D1 tests | `pnpm exec vitest run --testTimeout=20000 tests/integration/<file>` |
| Browser specs | `node --import tsx scripts/run-at-low-priority.ts pnpm run test:e2e:full <specs>` (the `browser-tests` skill) |
| The repository checks | `pnpm run verify <checks> <paths>`, such as `pnpm run verify comments,sizes docs/agents` |

- **Never use the finish gate as the inner loop.** `pnpm run check` runs every check and every
  unit and local D1 test, one after another.
- **Run the finish gate once per tree.** If nothing changed since the last green run (no commit,
  merge or lockfile change), cite that run.
- **CI on the final commit is the record** of what CI runs: `Quality Gate` runs what `check`
  does, and `Browser tests` runs every spec ([`ci.md`](ci.md)). A local run is cited only for
  what CI doesn't run.
- **A fix re-runs what it could have broken:** the check that failed and the tests for the
  changed code. Repeat screenshots and recordings only when the fix changes what they show.
- **A test that fails once and passes the next time is a failing test.** Fix it: wait for the
  state the user sees, never a fixed time.

## Waiting

- Anything that can take more than a couple of minutes runs in the background, with its output
  in a file under `tmp/agent/scratch/`: `pnpm run check`, the browser tests, a preview build,
  `pnpm run d1:profile`, CI and deploys.
- Heavy local runs go through `node --import tsx scripts/run-at-low-priority.ts <command>`, which
  caps them to a quarter of the CPU threads, so other agents on the machine keep working.
- No foreground `sleep` loops and no foreground `gh pr checks --watch`. One background watcher per
  wait, or the harness's completion notice.
- Before starting a browser test run, look for one already running: two stacks on one machine
  fail each other. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` lists the Node
  processes and their command lines on Windows, `pgrep -lf run-smoke` elsewhere.
- Don't change files a running check reads. Code work during a check goes in another worktree.
- With nothing else to do, hand back with the status and what is being waited for.

## Evidence

A pull request reports each level on its own line of the template's Evidence: build, automated
tests, UI tests, the installed or deployed thing, and the owner's acceptance. A lower level never
proves a higher one, and a level that doesn't apply says so (`UI tests: none, no screen changed`):
the `Pull request` workflow fails a line left empty ([`ci.md`](ci.md#pull-request)). Every change
has build and automated tests, from the finish gate or CI. Beyond that:

| Change | Needs |
| --- | --- |
| A page, component, route, redirect or header | The `verify-web` skill: each changed page at desktop and phone widths (390px), and redirects, headers and caching on `pnpm run preview`. What should keep working becomes a browser spec (the `browser-tests` skill). |
| An API route, an error answer, Run Keys or an MCP tool | The `verify-api` skill: the routes and tools the change touches, called on this checkout's server, with each answer kept. |
| A new or changed query | `pnpm run d1:profile`, and the rows-read budgets in `pnpm run test:local-d1` ([`d1-cost.md`](d1-cost.md)). |
| A migration | `pnpm run check:db:drizzle-parity` and the local D1 tests. Applying it to Staging or Production is the owner's ([`database-operations.md`](database-operations.md)). |
| Billing | The local end-to-end test in Stripe's test mode ([`billing.md`](billing.md#local-end-to-end-test)); never a live key. |
| A deploy workflow, routing, the Worker's configuration, or a smoke test | The deploy to Staging and its smoke test, after the merge ([`ci-deploys.md`](ci-deploys.md#smoke-tests)). |

Proof goes under `tmp/agent/verify/<date>-<what>/`, which git ignores and housekeeping keeps:
screenshots, recordings, accessibility snapshots, requests and answers, and the run's state. Show
the owner the working change before polishing the evidence, and take screenshots once, after
their changes. Link logs rather than pasting them.

## This checkout's ports

Two checkouts that serve on one port test each other's code. `tools/checks/ports.mjs` hands each
checkout its own, and `pnpm run ports` prints them from any folder in it:

| Role | Main checkout | A worktree | Used by |
| --- | --- | --- | --- |
| `dev` | 3000 | the first port of its block, such as 21010 | `pnpm run dev`, and `pnpm run ui:snap` when no `dev:all` runs |
| `e2e` | 4173 | the next, 21011 | The browser tests' server, which takes it or the next free port |
| `preview` | 8787 | 21012 | `pnpm run preview` |

- **The main checkout** keeps the ports the docs name. So does a CI runner, whose checkout is the
  main one.
- **A git worktree** claims a block of ten ports the first time anything asks: a file under the
  repository's `.git/serplists-ports/` that names the worktree. `pnpm run ports delete` gives the
  block up when the work is finished, and `pnpm run ports prune` those of worktrees that are gone,
  which the next claim does too.
- **`pnpm run dev:all`** takes the first free port from 3000 and records it in
  `tmp/dev-session.json`, so read its address from what it prints.
- **Read the address rather than assume it.** A `PORT` set in the shell wins over the script.

The script is tested in `tests/unit/tools/ports.test.ts`. The rest of what a run uses is the
checkout's own as well: local D1 and R2 in its `.wrangler/state`, the browser tests' D1 in
`.wrangler/smoke-state`, the build in `.next/` and `.open-next/`, and a temporary Chrome profile
for each session (`--isolated` in `.mcp.json`).

## Toolchain versions

Each toolchain's version is in one file, so a run here and a run in CI build with the same one.

| Toolchain | Where its version is |
| --- | --- |
| Node | `.node-version`, which every workflow reads (`tests/unit/workflows/workflow-rules.test.ts`). Build with the same major here. |
| pnpm | `packageManager` in `package.json` |
| Wrangler, OpenNext, Next.js, Playwright and the rest | `pnpm-lock.yaml`, installed with `--frozen-lockfile` in CI |
| The Chrome DevTools MCP server | `.mcp.json`, matched by the `verify-web` skill (`tests/unit/config/agent-tooling.test.ts`) |
| Chrome, ffmpeg and the Stripe CLI | Installed per person, with no pinned version ([`harness-debt.md`](../harness-debt.md)) |
