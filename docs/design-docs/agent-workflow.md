# Agent Workflow

How work moves from an issue to production, the tools agents share, and how the repo is
kept clean.

## From issue to merged PR

1. Pick an issue labeled `ready-for-agent`. If acceptance criteria are unclear, ask
   on the issue and label it `needs-info`.
2. Branch from `staging`. For multi-step work, add a plan under
   `docs/exec-plans/active/` ([PLANS.md](../PLANS.md)).
3. Reproduce first: `pnpm run setup`, `pnpm run dev:all`, then confirm the bug or
   current behavior in Chrome with the `verify-web` skill (recording it), with
   `pnpm run ui:snap`, or with a failing test
   ([development environment](development-environment.md), [agent tooling](#agent-tooling)).
4. Make the change with tests. Run `pnpm run verify` before opening the PR.
5. Open a PR into `staging` and fill in the template, including evidence for UI changes.
6. Review loop: review your own diff first. Claude then reviews the PR automatically
   (see [Claude code review](#claude-code-review)). Address every comment: fix it, or
   reply explaining why not. Humans may review but are not required to for routine
   changes.
7. Merge when CI is green ([quality gates](../RELIABILITY.md#quality-gates)).

Promotion to production is a PR from `staging` to `main`; CI runs the full browser
suite on it and deploys after merge. Open it from the branch that
`pnpm run promote:prepare` pushes, not from `staging` itself, and squash-merge it. Both
branches require linear history, so `main` never shares history with `staging` and a
direct PR conflicts in files that already match. The prepared branch has exactly
`staging`'s files with `main` recorded as merged, so it merges cleanly and no
sync-back PR from `main` to `staging` is needed afterwards. Squash only: a rebase merge
would replay `staging`'s history onto `main`. The script refuses to run if `main` has
changes that `staging` lacks (a hotfix) and lists the files; bring those into `staging`
with a normal PR, then run it again.

## Agent tooling

The Claude Code configuration everyone shares is committed, so every checkout and worktree
starts with the same tools. Personal settings go in `.claude/settings.local.json`, which git
ignores.

- **Chrome (`.mcp.json`):** the `chrome-devtools` MCP server
  ([chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp), pinned to an
  exact version) lets an agent drive the app in Chrome: open pages, read the accessibility
  tree, click and type, take screenshots, record video, and read the console, network
  requests, and performance traces. It starts its own Chrome with a temporary profile
  (`--isolated`) when a tool first needs one, and sends no usage statistics or CrUX lookups.
  Recording (`--experimental-screencast`) needs ffmpeg on the PATH; without it only the
  recording tools fail. Claude Code asks each person once per checkout to approve the server.
  `npx` starts it on Windows too, without a `cmd /c` wrapper (checked with Claude Code
  2.1.284). To upgrade, change the version in `.mcp.json` and in the `verify-web` skill's
  setup line; a test checks that they match.
- **Skills (`.claude/skills/`):** instructions Claude loads when a task matches a skill's
  description, or when you type `/<name>`. They point to the docs rather than repeat them.
  To add one, create `.claude/skills/<name>/SKILL.md` with `name` and `description`
  frontmatter and list it here.

  | Skill | Use it to |
  | --- | --- |
  | [verify-web](../../.claude/skills/verify-web/SKILL.md) | Run the app and check a change or reproduce a UI bug in Chrome, with screenshots and before-and-after recordings |
  | [debug-api](../../.claude/skills/debug-api/SKILL.md) | Find a request's server log lines by its `X-Request-Id`, look at local D1 data, and measure D1 rows read |
  | [browser-tests](../../.claude/skills/browser-tests/SKILL.md) | Pick the smallest Playwright run, read a failure, and write specs the way this repository does |

- **Permissions (`.claude/settings.json`):** Claude asks before commands that reach staging,
  production, Cloudflare, or live Stripe: wrangler with `--remote`, the `*:staging`,
  `*:prod`, and `*:remote` package scripts, deploys, version uploads, rollbacks, Worker
  deletion, secrets, `stripe:portal:configure`, and `stripe` with `--live`. `rg` is denied,
  since it crashes VS Code. The rules match the commands agents usually write, not every way
  to run a program, so they back the [escalation rules](../../AGENTS.md#escalate-to-a-human)
  rather than replace them.
- **CI loads the same settings:** the Claude jobs in [Claude code review](#claude-code-review)
  and [Weekly maintenance](#weekly-maintenance) run in the checkout. There an ask rule cannot
  prompt, so it denies: the review's guard fails on any denied tool, and the gardening job
  could not push its branch. A deny on the Grep or Glob tools would take them from both jobs.
  The settings therefore never deny or ask for what those jobs use: `git push`, `gh`, and
  the Grep and Glob tools. To keep the Grep tool (built on ripgrep) out of your own sessions,
  deny it in `.claude/settings.local.json`. Those jobs also start the `chrome-devtools`
  server, since `.mcp.json` servers load without approval there, but they allow none of its
  tools. `tests/unit/config/agent-tooling.test.ts` checks both directions: every package
  script that reaches staging, production, Cloudflare, or Stripe is asked, and nothing the
  CI jobs run is.
- **Checks:** `pnpm run docs:check` covers the skills as it does the docs: links and
  repository paths resolve, every `pnpm run` names a script in `package.json`, and each skill
  is named after its folder, has a description, and is listed above.

## Triage labels

Each triaged issue has exactly one state label. These are the canonical triage roles
used by the engineering skills (mattpocock/skills), used here as-is:

| Label | Meaning |
| --- | --- |
| `needs-triage` | Maintainer needs to evaluate or refine this issue |
| `needs-info` | Waiting on the reporter for specific information |
| `ready-for-agent` | Fully specified and ready for an autonomous agent |
| `ready-for-human` | Requires human judgment or implementation |
| `wontfix` | Will not be actioned |

Other labels may coexist with the state label:

| Label | Meaning |
| --- | --- |
| `waiting` | Blocked on a dependency, an external party, or another issue |
| `status: implementation` | Bounded remediation actively being implemented |
| `status: verification pending` | Implementation prepared; acceptance evidence and independent approval still required |
| `status: external proof blocked` | Completion requires human setup, authorized remote work, or production recovery evidence |
| `bug`, `feature`, `chore`, `refactor`, `ux`, `duplicate`, `epic` | Classification |

## Weekly maintenance

Agents copy whatever patterns exist, including bad ones, so the repo is cleaned in
small steps every week instead of in occasional big cleanups.
`.github/workflows/maintenance.yml` runs every Monday at 14:00 UTC (or on demand from
the Actions tab; scheduled workflows run from the default branch). Both of its jobs
start from `pnpm run maintenance:report`, which lists docs-check results, docs whose
referenced code changed since they were edited, stale design docs and plans, recorded
debt in the baselines, oversized files, and open tech debt.

- **Doc gardening (automatic):** Claude re-checks up to 8 flagged docs against the
  code, fixes what is no longer true, updates "Last verified" dates, runs
  `pnpm run docs:check`, and opens one PR into `staging` titled "docs: weekly doc
  gardening". It edits only `AGENTS.md`, `ARCHITECTURE.md`, and `docs/`, skips the
  week if a gardening PR is still open, and opens nothing when there is no drift.
  These PRs are small; skim and merge them. Claude code review skips them because
  a bot opens them.
- **Report issue:** the full report is posted to the issue "Weekly repository
  maintenance" (`chore`, `ready-for-agent`) for the items below that need judgment.

Work the issue in small PRs, one item each:

1. **Docs:** anything the gardening PR left unresolved; update its "Last verified"
   date in [the design-docs index](index.md).
2. **Debt:** fix a few baseline entries, then shrink the baseline
   (`pnpm run deps:baseline`, `pnpm exec eslint . --prune-suppressions`) and confirm
   the diff only removes entries.
3. **Size:** split one oversized file and lower its cap in `eslint.config.js`.
4. **Plans:** update stale active plans or move finished ones to `completed/`.
5. **Scores:** re-grade [QUALITY_SCORE.md](../QUALITY_SCORE.md) rows whose code changed.
6. **Harness:** if recent PRs repeated a mistake, add it to
   [core beliefs](core-beliefs.md) and, where possible, a lint rule or check whose
   message explains the fix.

## Claude code review

`.github/workflows/claude-code-review.yml` runs the Claude Code GitHub Action with the
`code-review` plugin on every non-draft PR opened by a person (opened, updated,
reopened, or marked ready). Bot-opened PRs, such as doc gardening, are skipped. Claude posts an inline comment for each high-confidence issue, or one summary
comment when it finds none. The review is advisory and never blocks merging.

- Guidelines: the plugin reads `CLAUDE.md`, so the workflow builds one on the runner
  from `AGENTS.md` and [core beliefs](core-beliefs.md). Keep review rules in those
  files; do not commit a `CLAUDE.md`.
- Once per PR: the plugin skips closed and draft PRs, trivial ones, and PRs Claude
  has already commented on, so pushes after the first review are not re-reviewed.
  For another pass after large changes, run `/code-review` in Claude Code locally.
- Cost: runs use the Claude subscription of whoever generated the token (counting
  against its usage limits) plus GitHub Actions minutes.
- Until the setup below is done, the job logs a notice and skips.
- Tools: `claude_args` must allow every tool in the plugin's `allowed-tools`
  frontmatter (its `gh pr`, `gh issue`, and `gh search` commands and the inline
  comment tool) plus `Task` for its subagents. A tool left out is denied, the review
  stops before posting anything, and the action still exits 0.
- Guard: the step after the review reads the action's `execution_file` log and fails
  the job when Claude was denied any tool, the run ended in an error, or there is no
  log, so a review that did not happen shows red instead of green. The annotation
  names the denied tool; add it to `claude_args`. The guard is inline in the
  workflow (the job can mint an OIDC token, so it runs no script from the PR), and
  `tests/unit/workflows/claude-code-review.test.ts` runs it and checks the allow
  list against the plugin's.
- Workflow validation: the action runs only when the workflow file on the PR is
  identical to the one on the default branch (`main`), so a PR cannot edit the
  workflow to reach the secret. A new or edited review or maintenance workflow
  therefore skips (the log says "Skipping action due to workflow validation") until
  it is promoted to `main`, and the review guard marks that run red because no
  review happened. The weekly schedule also runs only from `main`.

## Repository settings (admin only)

A GitHub admin applies these once:

- Branch protection or a ruleset on `main` and `staging`: require a pull request and
  the `Quality Gate` and `Drizzle schema parity` checks. Leave `Code Review` optional.
- Allow auto-merge, so green PRs merge without waiting on a person.
- Claude code review:
  1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository.
     The action authenticates as the app to post comments.
  2. On a machine with Claude Code signed in to a Pro, Max, Team, or Enterprise plan,
     run `claude setup-token` and save the printed token as the repository secret
     `CLAUDE_CODE_OAUTH_TOKEN` (`gh secret set CLAUDE_CODE_OAUTH_TOKEN`).

  The token belongs to the person who generated it. If their plan changes, or reviews
  start failing authentication, regenerate it and update the secret.
