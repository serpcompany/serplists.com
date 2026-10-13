# Deploys

How a change reaches Staging and Production: the deploy jobs, the guards they start with, the
smoke tests after them, the issue a failed deploy opens, promotion, and the actions pinned by
commit. Every workflow and what starts it is in [ci.md](ci.md); the environments, their hosts and
their bindings are in [environments.md](environments.md). Change a workflow's section in the same
pull request as the workflow.

## Principles

- Every check runs in CI, and nothing deploys unless the checks of that push passed.
- Deploys fail closed: pending D1 migrations, a later run, files Staging hasn't checked, or a
  failed smoke test stop the release.
- Staging first: Production deploys only files Staging has deployed and smoke-tested.
- Each environment has its own data: Staging never reads or writes Production's database or
  uploads.
- Schema changes go through Wrangler migrations only, never ad hoc remote SQL.
- If an incident starts right after a deploy, roll back first and debug second.

## Deploy pipeline

A push to `staging` or `main` runs `CI` ([ci.md](ci.md#ci)). When `Quality Gate` and
`Drizzle schema parity` pass, its `Deploy staging` job (on `staging`) or `Deploy production` job
(on `main`) calls `.github/workflows/deploy-staging.yml` or
`.github/workflows/deploy-production.yml`. Each has one job, `deploy`, which GitHub lists as
`Deploy staging / deploy` or `Deploy production / deploy`; the guards below find runs of it by
that name, and `tests/unit/workflows/deploy-workers.test.ts` keeps the names in step. A deploy is
never started with `workflow_run`: it waits for its push's checks through `needs:`.

The `deploy` job:

1. checks out the commit with its full history (`fetch-depth: 0`), because sitemap `lastmod`
   values come from `git log`; a shallow clone would stamp every page with the deploy date, so
   `sitemap:generate` fails on one in CI. Each bundled Template is dated by the newest commit on
   the built branch (first-parent) that changed its content, read from the pack history
   (`scripts/lib/sitemapLastmod.ts`). The committed
   `functions/sitemap/bundled-catalog.generated.json` is never trusted for those dates, so a copy
   generated before an edit was committed cannot keep an old date. Content not committed yet gets
   the local build time, kept while it stays the same.
2. refuses to deploy from an old run started again (below).
3. on Production only, refuses files Staging hasn't deployed and checked (below).
4. sets up pnpm and Node, restores the Next.js build cache of that environment's builds
   (`.next/cache`), and installs.
5. validates the env contract with the placeholder `BETTER_AUTH_SECRET`. The real secret is a
   Worker secret: `wrangler secret put BETTER_AUTH_SECRET --env <preview|production>`.
6. blocks while the environment's D1 has pending migrations: `pnpm run verify:staging` or
   `pnpm run verify:prod:d1`.
7. builds the Worker with `pnpm run build:worker`, with `SITE_ENV` set to the environment,
   `NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED=true`, and `NEXT_PUBLIC_RELEASE_COMMIT` set to the pushed
   commit, which `/api/health` and every page then report ([observability.md](observability.md)).
   `pnpm run build` refuses a localhost `NEXT_PUBLIC_API_URL` (unless `ALLOW_LOCAL_API_URL=1`), so
   a local API URL cannot ship.
8. deploys with `opennextjs-cloudflare deploy --env preview` or `--env production`, which uploads
   the `serp-checklists-preview` or `serp-checklists-production` Worker. The step fails when the
   output names no `workers.dev` URL, so a deployment is never left unchecked.
9. smoke-tests the new deployment and checks it against the site standards (below).

The Cloudflare credentials are the repository secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`
and `CLOUDFLARE_API_KEY`, the account's email and global API key. `CI` hands the deploy workflows
those three by name, and each workflow gives them to two steps only, the migrations check and the
deploy, so `pnpm install`'s scripts and the build never see them.

A branch's pushes deploy one at a time, in push order. On a push, `CI`'s concurrency group is the
workflow and the branch, such as `CI-push-refs/heads/staging`
([ci.md](ci.md#checks-a-merge-can-wait-for)), so:

- a push that arrives while a run of its branch is in progress waits until that run, deploy
  included, has finished;
- when a newer push arrives, GitHub cancels the push still waiting, and the newer one, whose
  commits include it, takes its place. A run cancelled while it waited runs no job: it deploys
  nothing and opens no issue, and the newest files deploy next;
- a run in progress is never cancelled, so a deploy never stops part way. The deploy job's own
  group, `deploy-staging` or `deploy-production`, never cancels a job in progress either.

Starting an old run again puts it in the same queue, where it cancels a push still waiting: once
the old run has finished, start that push's run again.

## An old run never deploys over a newer one

Each deploy job starts, right after its checkout, with the `latest-run` action
(`.github/actions/latest-run/`), which fails the job when a later run of `CI` on the branch has
already run that same deploy job. Deploying then would put old code over new, and nothing would
put the new code back. A branch's pushes run in order (above), so only an old run started again
meets a later run that has deployed; anyone who can write to the repository can start one, so the
action asks on every attempt.

- **What counts.** A later run's deploy job counts once it is running or has finished, in any of
  that run's attempts, whatever its result. A later run still waiting behind this one doesn't
  count, nor one cancelled before it ran the job, nor one whose checks failed so the job was
  skipped. A pull request's run never deploys, so it never counts.
- **The job fails, rather than passing with nothing deployed.** Production's gate reads a green
  staging deploy as "Staging runs these files", and a green job that deployed nothing would say
  so falsely.
- **To deploy an old commit on purpose,** revert to it in a new pull request.

The action needs `actions: read`, which the caller job in `CI` and the deploy job grant. A run of
a commit from before the guard has none: a run uses the workflow files of its own commit.
`tests/unit/workflows/latest-run.test.ts` runs the action's script against a stand-in for
GitHub's API.

## Production waits for Staging

Before it installs anything, the Production job runs the `staging-verified` action
(`.github/actions/staging-verified/`). It reads the git tree of the commit on `main`, then lists
the push runs of `CI` on `staging` and passes when one of them built the same tree and its
`Deploy staging / deploy` job passed in its latest attempt. That job ends with the smoke tests, so
a pass means Staging ran these exact files and they worked there.

A promotion gives `main` exactly `staging`'s files, so its tree is one `staging` had. The job
fails, saying why, when:

- no push run on `staging`, among its last 100, built this tree, as for a change pushed or merged
  straight into `main`: merge it into `staging` first, then promote. The `Pull request`
  workflow's `base` check fails such a pull request before it merges
  ([ci.md](ci.md#pull-request));
- Staging's deploy of this tree failed, was skipped, or is still running: once it passes, start
  the Production job again, which the `latest-run` guard allows while no later run has deployed.

`tests/unit/workflows/staging-verified.test.ts` runs the script against a stand-in for GitHub's
API.

## Smoke tests

After the deploy, two scripts check the new deployment on its `workers.dev` address, as SERP's
Environment Configuration standard asks: the zone's bot protection blocks CI runners on the
branded hosts. Each request carries the smoke-test header (`x-serplists-smoke-test`), which
`next.config.ts` exempts from the redirect to the environment's host, so the checks reach the new
deployment before the domain serves it.

`scripts/verify-deployment.ts`, given `DEPLOY_URL`, `RELEASE_COMMIT` (the pushed commit) and
`SITE_ENV`, follows no redirect and checks:

1. `/api/health` answers 200 with `{"status":"ok","release":{"commit":…,"environment":…}}`,
   naming the commit just deployed and the environment;
2. `/api/templates` answers 200, so D1 is bound;
3. `/about/` answers 200 and its `<meta name="serplists-release">` names the commit just deployed,
   since a page can answer from an older build than the health route;
4. a sign-in as an account made up for this run, posted as JSON from the deployment's own origin
   to `/api/auth/sign-in/email`, is refused with 401 or 403. Its email and password are random
   (`randomUUID()`) and written nowhere: anyone may sign up on Staging, so a fixed account the
   repository names could be registered, and every Staging deploy, and so every Production one,
   would then fail.

It tries each check up to six times, 10 seconds apart, while the new deployment comes up or the
previous one still answers, and fails the deploy when the last try still gets another answer. It
fails at once on a release that names another environment, and on any answer to the sign-in but
401, 403, a server error or none, so a sign-in is never tried twice when it could succeed. A
missing input fails it too. `tests/unit/scripts/verify-deployment.test.ts` covers each check.

`scripts/check-site-standards.ts <url> <staging|production>` then checks the URL standard and the
environment's rules ([environments.md](environments.md#checking-a-running-site)). It runs up to
three times, 20 seconds apart, because a brand-new Worker answered 404 for its pages in its first
seconds (`checkSiteStandardsUntilItPasses`).

## A failed deploy opens an issue

When a push's run fails, in its deploy job or in a check, which skips the deploy, `CI`'s
`Report a failed deploy` job runs the `deploy-failed` action (`.github/actions/deploy-failed/`).
It comments on the open issue titled `Staging deploy failed` (a push to `staging`) or
`Production deploy failed` (a push to `main`), labelled `bug`, with the commit and the run's link,
or opens that issue when none is open, so GitHub notifies the repository's watchers. A push
cancelled while it waited opens nothing: the push that took its place carries its commits. Close
the issue once a deploy of that environment passes again. It is the only job in `CI` with a write
token: `issues: write`, on that job alone. `tests/unit/workflows/deploy-failed.test.ts` runs the
script against a stand-in for GitHub's API.

## Promotion

`staging` deploys Staging, and `main` Production. Accepted work moves to `main` by a promotion
pull request that `pnpm run promote:prepare` prepares and a squash merge lands
([issue-tracker.md](issue-tracker.md)). The script:

- refuses when `main` has changes `staging` lacks, such as one merged straight into `main`, and
  lists their files. A hotfix is no exception: it goes through `staging` like any change;
- writes the promotion's body to `tmp/promotion-body.md`: one `Closes #<number>` line for each
  issue that the pull requests merged into `staging` since the last promotion closed, read from
  each one's body with `gh`, then the pull requests it promotes. Merging into `main`, the default
  branch, closes those issues, which merging into `staging` doesn't ([ci.md](ci.md#pull-request));
- pushes a `promote/staging-<date>-<commit>` branch with exactly `staging`'s files and `main`
  recorded as merged, and prints the `gh pr create` command, with a `chore:` title and that body.

"Since the last promotion" means after the newest commit on `staging`'s first-parent line whose
files `main` has had. `tests/unit/scripts/promote-prepare.test.ts` covers the range, the lines it
reads and the body it writes.

## Pinned actions

A job that holds a secret or a write token runs every action at a pinned commit. A tag such as
`@v5` can be moved to new code, which would then run with Cloudflare's key, Claude's token or a
write token. Jobs with neither may name an action by its major-version tag.
`tests/unit/workflows/workflow-rules.test.ts` holds the pins, and this table, to that.

To update one, pin the new release's commit and change this table in the same pull request.

| Action | Commit | Version | Used in |
| --- | --- | --- | --- |
| `actions/checkout` | `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` | v5.1.0 | `.github/workflows/ci.yml`, `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/maintenance.yml` |
| `actions/setup-node` | `a0853c24544627f65ddf259abe73b1d18a591444` | v5.0.0 | `.github/workflows/claude.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/maintenance.yml` |
| `pnpm/action-setup` | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` | v6.0.10 | `.github/workflows/claude.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/maintenance.yml` |
| `actions/cache` | `caa296126883cff596d87d8935842f9db880ef25` | v5.1.0 | `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml` |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 | `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/maintenance.yml` |
| `anthropics/claude-code-action` | `2dca132ff0e0c4094ce6048b422c6915a071210b` | v1.0.247 | `.github/workflows/claude.yml`, `.github/workflows/code-review.yml`, `.github/workflows/maintenance.yml` |
