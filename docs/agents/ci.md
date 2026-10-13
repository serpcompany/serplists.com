# CI workflows

The workflows are in `.github/workflows/`, and the actions they share are in `.github/actions/`.
Workflow files hold no comments ([code.md](code.md)), so what starts each one, what it runs and
why it is built that way are in three docs. Change a workflow's section in the same pull request
as the workflow.

- **This doc:** every workflow and what starts it, the checks a merge can wait for, and each
  workflow that checks a pull request.
- [ci-deploys.md](ci-deploys.md): the deploys, the guards they start with, the smoke tests, the
  alert when one fails, promotion, and the actions pinned by commit.
- [ci-agents.md](ci-agents.md): the workflows Claude runs in, and the app and token they use.

Every job runs on `ubuntu-latest`, has a time limit, and reads the repository's contents only,
unless its section says otherwise. A job that installs sets up pnpm from `packageManager` in
`package.json` and the Node that `.node-version` names, caches the pnpm store through
`actions/setup-node`, and installs with `pnpm install --frozen-lockfile`, which fails when the
lockfile is out of date. A job that runs the checks or builds sets `BETTER_AUTH_SECRET` to
`ci-build-placeholder-secret-32-chars-minimum`, a placeholder that is not a secret, because the env
contract wants 32 characters. `tests/unit/workflows/workflow-rules.test.ts` holds every workflow
to the time limits and the Node version.

| Workflow | File | Starts on | Section in |
| --- | --- | --- | --- |
| `CI` | `.github/workflows/ci.yml` | Every pull request, again when it is marked ready; the merge queue; pushes to `staging` and `main`; by hand | This doc; its deploy jobs in [ci-deploys.md](ci-deploys.md) |
| `Browser tests` | `.github/workflows/browser-tests.yml` | Every pull request, again when it is marked ready; the merge queue | This doc |
| `Pull request` | `.github/workflows/pull-request.yml` | Every pull request, again when its title, body or base is edited; the merge queue | This doc |
| `Deploy staging to Cloudflare Workers` | `.github/workflows/deploy-staging.yml` | Called by `CI` on a push to `staging` | [ci-deploys.md](ci-deploys.md) |
| `Deploy production to Cloudflare Workers` | `.github/workflows/deploy-production.yml` | Called by `CI` on a push to `main` | [ci-deploys.md](ci-deploys.md) |
| `Code review` | `.github/workflows/code-review.yml` | See [ci-agents.md](ci-agents.md) | [ci-agents.md](ci-agents.md) |
| `Claude` | `.github/workflows/claude.yml` | See [ci-agents.md](ci-agents.md) | [ci-agents.md](ci-agents.md) |
| `Weekly maintenance` | `.github/workflows/maintenance.yml` | See [ci-agents.md](ci-agents.md) | [ci-agents.md](ci-agents.md) |

GitHub also runs a workflow with no file here: `CodeQL`, code scanning's default setup, turned on
in the repository's settings. It runs on pushes to `staging` and `main` and on every pull request.
`gh api repos/serpcompany/serplists.com/actions/workflows` lists it as
`dynamic/github-code-scanning/codeql`. It isn't a check a merge waits for.

## Checks a merge can wait for

Today `staging` and `main` require one check, `Quality Gate`, and no merge queue, so a failing
browser test or schema parity check stops no merge. Required checks and the merge queue are
repository settings an admin turns on; nothing in the repository can. The workflows are built so
the admin only has to switch them on:

- **Each starts on every pull request and on `merge_group`.** A required check has to report
  every time. A workflow that a `paths` filter skipped would leave its check pending and block the
  merge, and one that never ran in the merge queue would block the queue. None of them filters by
  path or by base branch, so a pull request stacked on another branch is checked too.
- **Each ends in one job that always runs.** It fails when a job it needs failed or was
  cancelled, and passes when they passed or were skipped. A job skipped because the one it needs
  failed counts as passing, so only this last job is safe to require.
- **Only a pull request's run is cancelled once it has started,** by a new push to that pull
  request. `Browser tests` and `Pull request` use SERP's CI Workflows group,
  `${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}`,
  so a run in the merge queue never waits for or cancels another. `CI` adds the branch for a push,
  `${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.event_name == 'push' && format('push-{0}', github.ref) || github.run_id }}`,
  so it runs a branch's pushes one at a time, in push order: a push waits while the run before it
  finishes, deploy included, and a push still waiting is cancelled when a newer one, which
  carries its commits, arrives ([ci-deploys.md](ci-deploys.md#deploy-pipeline)).
- **Drafts run everything.** The repository is public, so standard runners cost nothing, and
  `ready_for_review` starts the checks again when a draft is marked ready.

The jobs to require, in a ruleset for `staging` and for `main`, with Require merge queue on:

| Job | Workflow | Covers |
| --- | --- | --- |
| `CI passed` | `CI` | `Quality Gate` and `Drizzle schema parity` |
| `Browser tests passed` | `Browser tests` | `Browser tests` |
| `Pull request passed` | `Pull request` | `base`, `title`, `issue-link`, `fix-test` and `evidence` |

The jobs they cover keep their names, so the rule that requires `Quality Gate` today keeps
working until the admin switches to the three above. `issue-link` is the name SERP's standard
requires; `Pull request passed` covers it. `tests/unit/workflows/workflow-rules.test.ts` holds the
three workflows to this shape: the triggers, the concurrency group, and a last job that needs
every job a pull request runs.

## CI

`.github/workflows/ci.yml` checks every pull request, every merge group, and every push to
`staging` and `main`. Its jobs:

- **`Quality Gate`** (`quality`) checks out the full history, then runs, in order:
  1. on a pull request only, `scripts/check-fix-commits.ts --range origin/staging..<head>`: every
     `fix:` commit the pull request adds to `staging` changes a test ([checks.md](checks.md)). A
     merge queue run skips it, since the pull request's run checked the same commits.
  2. `pnpm run typecheck:env`, the env contract.
  3. `pnpm run verify`, every repository check ([checks.md](checks.md)).
  4. `pnpm run lint` and `pnpm run typecheck`.
  5. `pnpm run test:run`, the unit tests, and `pnpm run test:local-d1`, the tests on a local D1.
- **`Drizzle schema parity`** (`db-parity`) runs `pnpm run check:db:drizzle-parity`: every
  migration replayed and compared with the Drizzle schema.
- **`CI passed`** (`ci-passed`), the job to require.
- On a push to `staging` or `main`, once both checks pass, **`Deploy staging`** or
  **`Deploy production`**, and **`Report a failed deploy`** when that deploy, or a check that
  skipped it, failed ([ci-deploys.md](ci-deploys.md#a-failed-deploy-opens-an-issue)).

These are the commands `pnpm run check` runs locally, the finish gate, so a change that passes
`check` passes this workflow. It doesn't build: the deploy jobs build for their environment, and
`Browser tests` builds for its tests.

## Browser tests

`.github/workflows/browser-tests.yml` runs every browser test on every pull request and in the
merge queue. Its `Browser tests` job:

1. checks out the full history, since the build dates the sitemap from `git log`
   ([seo-and-sitemaps.md](seo-and-sitemaps.md));
2. restores the Next.js build cache (`.next/cache`) that production builds saved;
3. builds the Worker with `pnpm run build:worker`, with `SITE_ENV=production` and
   `NEXT_PUBLIC_RELEASE_COMMIT` set to the commit under test;
4. installs Chromium and runs `pnpm run test:e2e:full -- --skip-build`: every spec, against the
   build in workerd, on an isolated local stack ([testing.md](testing.md));
5. on a failure, keeps the traces, videos and screenshots as the `playwright-evidence` artifact
   for 7 days.

The whole suite took 11 to 14 minutes on #295, so the job has 45. It used to run only the smoke
tests and the changed specs on pull requests into `staging`; a merge into `staging` deploys
Staging, so every spec now runs before one. A push doesn't run it: the merge queue, once on, runs
it on the tree that will land. `Browser tests passed` is the job to require.
`tests/unit/workflows/browser-tests.test.ts` holds the job to these steps.

## Pull request

`.github/workflows/pull-request.yml` holds five rules about a pull request itself, each a job:

- **`base`**: a pull request into `main` is a promotion, from a `promote/` branch of this
  repository. Production deploys only files Staging has deployed and checked
  ([ci-deploys.md](ci-deploys.md#production-waits-for-staging)), so any other change into `main`,
  a hotfix included, would merge and then never deploy. The job says to open it into `staging`,
  and to promote it once Staging's deploy passes. A pull request into any other branch passes.
- **`title`**: the title is a Conventional Commit: `feat`, `fix`, `perf`, `refactor`, `docs`,
  `test`, `build`, `ci` or `chore`, an optional scope in brackets, an optional `!`, a colon and a
  space, as in `fix: Escape closes the Settings window`. A squash merge makes the title the
  commit's subject, so it is the changelog line.
- **`issue-link`**: the body starts with one `Closes #<number>` line for each issue the pull
  request finishes, or its first line is `No issue: <reason>`. "Part of #N" and "Refs #N" close
  nothing. For each number, the job asks GitHub for the issue, read-only, with the workflow token
  (`GET /repos/{owner}/{repo}/issues/{number}`), and fails when there is no such issue or the
  number is a pull request.
- **`fix-test`**: a pull request titled `fix:`, or from a `fix/` branch, adds or changes a test: a
  file under `tests/`, or a `*.test.*` or `*.spec.*` file, the list the commit-msg hook uses
  (`scripts/lib/fix-commits.ts`). It reads the pull request's files from GitHub, leaving out
  deleted ones. `Quality Gate` checks each `fix:` commit; this checks the title, which a squash
  merge lands.
- **`evidence`**: the body's `## Evidence` section says something for each level, on a line of its
  own: `Build:`, `Automated tests:`, `UI tests:`, `Installed or deployed artifact:` and
  `Owner acceptance:`, as the template has them. A lower level never proves a higher one, so each
  is reported apart, and a level that doesn't apply says so, as in
  `UI tests: none, no screen changed`.
- **`Pull request passed`**, the job to require.

**Why it reads the body.** SERP's `pr-issue-link.yml` asks GitHub which issues a pull request
closes. GitHub links a closing keyword only on a pull request into the default branch, which is
`main` here, while work merges into `staging`, so that check would fail every pull request. This
one reads the lines instead and checks that each names an issue. The issues close when the
promotion merges into `main`: `pnpm run promote:prepare` writes one `Closes #<number>` line into
the promotion's body for each issue its pull requests closed
([ci-deploys.md](ci-deploys.md#promotion)). A promotion, a pull request into `main` from a
`promote/` branch of this repository, needs no line of its own, and no evidence of its own: its
evidence is Staging's deploy of the same files, which the Production deploy checks. A `promote/`
branch's pull request into another branch is checked like any other.

Each job runs `tools/checks/pull-request.mjs`, which needs nothing but Node, so the job checks
out that one file and installs nothing. The title and body reach it through the environment,
never inside the command. It prints what GitHub sent only with workflow commands stopped
(`::stop-commands::`), and its `::error::` line holds only its own text: the runner also ends a
line at a lone carriage return, which GitHub keeps in a body. So a title, a body or a file name
shaped like a command runs none. The workflow runs again when the title, body or base is edited.
A pull request a bot opened skips all but `base`: a bot's pull request into `main` couldn't deploy
either. In the merge queue the jobs start and pass at once: the pull request was checked, and a
required check that never reports in the queue blocks every merge.
`tests/unit/workflows/pull-request.test.ts` runs the script against a stand-in for GitHub's API.
