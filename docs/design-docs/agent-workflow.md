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
4. Make the change with tests.
   - For a bug, the failing test from step 3 becomes the regression test. Commit it with
     the fix as `fix:`: the commit-msg hook and CI refuse a `fix:` commit that changes no
     test.
   - Run the tests a change touches before you push, browser specs included. Run browser
     specs through `node --import tsx scripts/run-at-low-priority.ts pnpm run test:e2e:full
     <specs>`, which caps the build and the browsers to a quarter of the CPU threads.
   - Run `pnpm run verify` before opening the PR; the push hook runs it too.
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
  | [pr-review](../../.claude/skills/pr-review/SKILL.md) | Review a PR for bugs and rule breaches, post new findings inline, and keep one summary comment current; the CI review runs it on every push |

- **Permissions (`.claude/settings.json`):** Claude asks before commands that reach staging,
  production, Cloudflare, or live Stripe: wrangler with `--remote`, the `*:staging`,
  `*:prod`, and `*:remote` package scripts, deploys, version uploads, rollbacks, Worker
  deletion, secrets, `stripe:portal:configure`, and `stripe` with `--live`. `rg` is denied,
  since it crashes VS Code. Each rule starts with the command it guards (`wrangler`,
  `npx wrangler`, `pnpm wrangler`, `pnpm exec wrangler`, the same four for
  `opennextjs-cloudflare`, and `pnpm` for the package scripts), never with a wildcard: a
  leading `*` matches text anywhere in a command, so a search for "wrangler deploy" or a
  review comment that mentions one would trip it. Every Bash rule has a PowerShell twin. The
  rules match the commands agents usually write, not every way to run a program, so they
  back the [escalation rules](../../AGENTS.md#escalate-to-a-human) rather than replace them.
- **CI loads the same settings:** the Claude jobs in [Claude code review](#claude-code-review)
  and [Weekly maintenance](#weekly-maintenance) run in the checkout, and on pull requests
  the action restores these files from the base branch. There an ask rule cannot prompt,
  so it denies: the review's guard names any denied tool and fails when the review posted
  nothing, and the gardening job could not push its branch. A deny on the Grep or Glob
  tools would take them from both jobs. The settings therefore never deny or ask for what
  those jobs use: `git push`, `gh`, and the Grep and Glob tools. To keep the Grep tool
  (built on ripgrep) out of your own sessions, deny it in `.claude/settings.local.json`.
  Both jobs pass `--strict-mcp-config`, so the `chrome-devtools` server in `.mcp.json`
  never starts in CI. `tests/unit/config/agent-tooling.test.ts` checks both directions:
  every package script that reaches staging, production, Cloudflare, or Stripe is asked,
  and nothing the CI jobs run, or merely mention, is.
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
check out `staging` with its full history, since the report compares each doc's last edit
with the code it references, and start from `pnpm run maintenance:report`, which lists docs-check results, docs whose
referenced code changed since they were edited, stale design docs and plans, files near
the size limit, and open tech debt.

- **Doc gardening (automatic):** Claude re-checks up to 8 flagged docs against the
  code, fixes what is no longer true, updates "Last verified" dates, runs
  `pnpm run docs:check`, and opens one PR into `staging` titled "docs: weekly doc
  gardening". It edits only `AGENTS.md`, `ARCHITECTURE.md`, and `docs/`, skips the
  week if a gardening PR is still open, and opens nothing when there is no drift.
  These PRs are small; skim and merge them. Claude code review skips them because
  a bot opens them. Its commits and PRs carry no attribution (the `attribution` setting
  plus the prompt, since the model otherwise adds a Co-Authored-By trailer by habit). Like
  the review, the job keeps Claude's subagents in the foreground
  (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`) and keeps Claude's transcript as a week-long
  artifact. A check after it prints what Claude said and passes only on an outcome: a
  gardening PR opened during the run, "No doc drift found", or an open gardening PR left
  alone. It fails when Claude left no log, ended in an error or with subagents still
  running, or reached none of those outcomes, and a denied tool only warns when Claude got
  there anyway, since it often retries a refused command another way
  (`tests/unit/workflows/maintenance.test.ts`).
- **Report issue:** the full report is posted to the issue "Weekly repository
  maintenance" (`chore`, `ready-for-agent`) for the items below that need judgment. The job
  writes it to `tmp/weekly-report.md`: a Markdown file at the repository root would fail the
  docs check the report itself runs.

Work the issue in small PRs, one item each:

1. **Docs:** anything the gardening PR left unresolved; update its "Last verified"
   date in [the design-docs index](index.md).
2. **Debt:** close one row of the
   [tech debt tracker](../exec-plans/tech-debt-tracker.md).
3. **Size:** split one file the report lists as near the 500-line limit, by
   responsibility.
4. **Plans:** update stale active plans or move finished ones to `completed/`.
5. **Scores:** re-grade [QUALITY_SCORE.md](../QUALITY_SCORE.md) rows whose code changed.
6. **Harness:** if recent PRs repeated a mistake, add it to
   [core beliefs](core-beliefs.md) and, where possible, a lint rule or check whose
   message explains the fix.

## Claude code review

`.github/workflows/claude-code-review.yml` runs the Claude Code GitHub Action on every push
to a non-draft PR opened by a person (opened, updated, reopened, or marked ready).
Bot-opened PRs, such as doc gardening, are skipped. Claude reviews with the
[pr-review skill](../../.claude/skills/pr-review/SKILL.md): each new finding becomes an
inline comment, and one summary comment names the commit reviewed, counts the new
findings, and says whether each earlier finding is fixed or still applies. The review is
advisory and never blocks merging, but its check goes red when Claude posted or updated
nothing. Run the same review locally with `/pr-review <owner>/<repo>/pull/<number>`.

- Re-reviews without repeats: before the review, a step reads what Claude posted on
  earlier pushes (its top-level inline comments and its summary, the comment that starts
  with `## Claude review`) and passes them in. The skill drops any finding that repeats
  one, however it is worded or wherever its lines moved, and edits its summary in place by
  id (`gh api --method PATCH repos/<owner>/<repo>/issues/comments/<id>`), or creates it
  when the PR has none, never with `gh pr comment --edit-last`: Claude's latest comment can
  be its answer to an `@claude` request. Those answers, and its replies in review threads,
  are passed in as context only, and the check after the review does not count them as the
  review. `allowed_bots: "claude[bot]"` lets the review run on a push that an `@claude`
  request made.
- Rules: before Claude starts, the action replaces `CLAUDE.md`, the .claude folder, and
  .mcp.json with the base branch's copies (a PR's copies are untrusted) and deletes them
  when the base has none. So the skill always comes from the base branch, and a PR cannot
  change how it is reviewed. The workflow copies `AGENTS.md` and [core beliefs](core-beliefs.md)
  from the base branch too, so a PR cannot weaken the rules it is reviewed against, and adds
  the earlier findings. It writes them to a file outside the checkout and appends it to the
  system prompt of Claude and of every subagent. Keep review rules in those two files; do not
  commit a `CLAUDE.md`.
- Subagents in the foreground: the skill reviews with three subagents at once (bugs, rules,
  and tests and docs), which Claude Code runs in the background by default. Claude then
  ends its turn to wait for them, the action stops at that first result, and nothing is
  posted ([claude-code-action#1646](https://github.com/anthropics/claude-code-action/issues/1646)).
  The review step sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, so they run in the
  foreground.
- Tools: `claude_args` allows every tool in the skill's `allowed-tools` frontmatter:
  `gh pr view`, `gh pr diff`, `gh pr comment`, the inline comment tool, `Task`, and Read,
  Glob, and Grep. Naming Glob and Grep brings those tools back on Linux, where Claude Code
  otherwise searches with `grep` and `find` in Bash. `--strict-mcp-config` keeps the
  repository's MCP servers out of the review. The model is pinned in `claude_args`, so an
  action update cannot change it silently.
- Guard: the step after the review fails the job unless Claude posted or updated something
  on the PR during the run: an inline comment, a review, or the summary, counting from 30
  seconds before the review started, for clock skew between the runner and GitHub. The
  doc gardening check uses the same allowance. It also fails when
  the review wrote no log, ended in an error, or ended with subagents still running, and it
  names any denied tool (a warning when the review still posted). It reads the PR with the
  workflow token, which only needs read access. It and the earlier-findings step are inline
  in the workflow (the job can mint an OIDC token, so it runs no script from the PR), and
  `tests/unit/workflows/claude-code-review.test.ts` runs both against a stand-in for the
  GitHub API.
- Transcript: the action logs only turn and denial counts. Each run uploads Claude's full
  transcript as the `claude-review-transcript` artifact, kept for a week, and the step
  summary shows turns, time, estimated cost, and models.
- Cost: runs use the Claude subscription of whoever generated the token (counting against
  its usage limits) plus GitHub Actions minutes, and every push is reviewed. In a sandbox,
  reviews of small PRs took 20 to 70 seconds and about $0.10 to $0.25 each; the step
  summary shows every run's figures.
- Until the setup below is done, the job logs a notice and skips.
- Workflow validation: the action runs only when the workflow file on the PR is identical
  to the one on the default branch (`main`), so a PR cannot edit the workflow to reach the
  secret, and a change to the workflow cannot be tried on a PR here. Develop changes in a
  throwaway repository with the same workflow, skill, and rules files first. A new or edited
  review or maintenance workflow skips (the log says "Skipping action due to workflow
  validation") until it is promoted to `main`, and the guard marks that run red because no
  review happened. PRs into `staging` skip the same way while `staging`'s copy of the
  workflow differs from `main`'s. The weekly schedule also runs only from `main`.

## @claude requests

`.github/workflows/claude.yml` answers `@claude` in an issue, a PR comment, a review or a
review comment, from anyone with write access, and never from a bot, so Claude's own comments
cannot start it again (one run per issue or PR at a time).

- On a PR it checks out the PR's head and may push fixes to the PR's branch; on an issue it
  branches from `staging`. Rules appended to its system prompt say to follow `AGENTS.md`, run
  `pnpm run verify` before pushing, stage files by path (blanket `git add -A`, `.`, `-u` and
  `git commit -a` are refused, since the action resets `.claude/` on a PR and a blanket add
  would commit that reset), add no attribution, and never push to `main` or `staging`.
- A check after it reads Claude's log and the branch: it passes when Claude answered in its
  comment or pushed, fails when Claude did neither, ended in an error or with subagents
  running, or pushed a commit with attribution, and warns when a commit changes a file the
  action resets or Claude pushed without replying (`tests/unit/workflows/claude.test.ts`).
- It uses the same token and app as the review, and like the review it runs only once the
  workflow file matches `main`'s copy.

## Repository settings (admin only)

A GitHub admin applies these once:

- Branch protection or a ruleset on `main` and `staging`: require a pull request and
  the `Quality Gate`, `Drizzle schema parity` and `Browser tests` checks. Leave `Code Review` optional.
- Allow auto-merge, so green PRs merge without waiting on a person.
- Claude code review:
  1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository.
     The action authenticates as the app to post comments.
  2. On a machine with Claude Code signed in to a Pro, Max, Team, or Enterprise plan,
     run `claude setup-token` and save the printed token as the repository secret
     `CLAUDE_CODE_OAUTH_TOKEN` (`gh secret set CLAUDE_CODE_OAUTH_TOKEN`).

  The token belongs to the person who generated it. If their plan changes, or reviews
  start failing authentication, regenerate it and update the secret.
