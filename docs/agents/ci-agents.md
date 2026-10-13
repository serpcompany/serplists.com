# Claude's workflows

Three workflows run Claude in GitHub Actions: it reviews every pull request, answers `@claude`,
and gardens the docs and the code each week. Every workflow and what starts it is in
[`ci.md`](ci.md), and the commits their actions are pinned to are in
[`ci-deploys.md`](ci-deploys.md). Change a workflow's section here in the same pull request as the
workflow.

**A change to `claude.yml` or `maintenance.yml` runs only once it reaches `main`.** Their jobs get
a GitHub token from Claude's app, which first checks that the workflow file matches the copy on
the default branch, `main`. When it doesn't, the action skips ("Skipping action due to workflow
validation") and writes no log, and the job's check fails. Comments on issues and in a pull
request's conversation run `main`'s copy of `claude.yml` anyway, and the weekly schedule runs
`main`'s `maintenance.yml`: try a change to either in a throwaway repository with the same
workflow, skill, and rules first, and promote it soon after it merges. The review takes the job's
own token instead (Code review, below), so its file isn't checked against `main`'s. That check
skipped every review of a pull request into `staging` from #260 to #296 while `code-review.yml`
differed from `main`'s. Whether the review now runs while they differ is untested: the pull
request that brings the change runs its own copy, as does every pull request into `staging` until
the promotion, so the first of them shows it.

## Code review

`.github/workflows/code-review.yml` has Claude review every push to a pull request that isn't a
draft, with the repository's `pr-review` skill (`.claude/skills/pr-review/SKILL.md`), which starts
from SERP's
[Review Prompt](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/review-prompt.md):
three reviewers in parallel (bugs; rules; and the issue, tests, and docs) read the issue the pull
request closes and every changed file. Each new finding is an inline comment marked blocking or
suggestion, and one summary comment, updated on every review, gives the round and says how many of
the changed files were read. It reviews the pull requests people open and the ones `claude[bot]`
opens, such as the gardening ones, and skips other bots. Its check isn't one a merge waits for
(those are the gate jobs in [Checks a merge can wait for](ci.md#checks-a-merge-can-wait-for)), and a
finding holds up a merge only once an admin requires every conversation on `staging` and `main`
to be resolved. Answer a finding by fixing it, by replying, or with an `@claude` request in its
thread.
Run the same review locally with `/pr-review <owner>/<repo>/pull/<number>`: it shows you what it
would post, and posts only when you say so. How it's built, and why:

- **A pull request can't change its own review.** The action replaces `CLAUDE.md`, `.claude/`, and
  `.mcp.json` with the base branch's copies before Claude starts, keeping the pull request's under
  `.claude-pr/` for the reviewer to read, so the skill and the settings come from the base branch.
  A hook in those settings would still run a script from the pull request's checkout, such as
  `tools/checks/hook.mjs`, with the job's tokens in its environment, so every Claude job in CI
  turns hooks off (`--settings '{"disableAllHooks":true}'`). The action leaves `AGENTS.md` alone,
  so the job writes the base branch's `AGENTS.md` over the pull request's. The job also copies
  `AGENTS.md`, `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md` from the base branch into
  a file outside the checkout, and hands it to Claude and every subagent
  (`--append-system-prompt-file`, `--append-subagent-system-prompt-file`). On a base branch from
  before the docs moved, it takes the core beliefs and the product sense doc from their old paths
  instead.
- **It reads the issue as data.** The job finds the `Closes #<n>` lines in the pull request's body
  and writes each issue, with its comments, to `tmp/review-issues.md`. Anyone can write an issue,
  so its text goes into no prompt: Claude reads the file with Read, and gives each reviewer only
  the pull request's number and the file's path, so each reads it with Read too. GitHub links
  closing keywords only on pull requests into the default branch, so the job reads the body itself.
- **Claude posts nothing.** It writes its findings to `tmp/review-findings.json` and the summary to
  `tmp/review-summary.md`, the only files it may write (`Edit` rules for the two, in
  `--allowedTools` and the skill's `allowed-tools`), so nothing it reads can have it change a file
  the job runs. A step after it posts them with the job's own token, as `github-actions[bot]`:
  each finding as an inline comment on the reviewed commit (on its file when GitHub can't place it
  on its line, and in the summary when its file isn't in the pull request), then the summary, by
  editing the earlier summary comment by id or creating one. The step refuses a summary without its
  `## Claude review` heading or too long for a comment, a finding with no file, no line, or no
  blocking or suggestion mark, and any of them holding what looks like a token (`ghs_`, `ghp_`,
  `gho_`, `ghu_`, `github_pat_`, `x-access-token:` or `sk-ant-` and a token's characters, or the
  checkout's credentials header), and then posts nothing. The job deletes any of these files the
  pull request carries before Claude starts. The token needs `pull-requests: write`: GitHub
  refuses a comment on a pull request from a token with only `issues: write`. Claude needs no
  GitHub write tool, so `.claude/settings.json` can ask before every `gh api` write.
- **Claude holds only the job's token.** The action takes the job's own token (`github_token`)
  and asks Claude's app for none, so the job needs no `id-token: write`. It hands that token to
  Claude as `GH_TOKEN` and `GITHUB_TOKEN` and writes it into the checkout's `origin` URL,
  whatever the checkout kept: without the input, the app's token, which can also write the
  contents and issues, would sit there. The job's token reads the contents and issues and writes
  to pull requests, for the posting step; Claude has no tool that writes with it, and the posting
  step refuses token-shaped text ([`harness-debt.md`](../harness-debt.md), Harness).
- **A re-review raises only what's new.** Before Claude starts, the job adds to its instructions
  the findings already on the pull request (posted by the workflow, or by Claude itself before the
  workflow posted them) and the latest summary. Claude's answers to `@claude` requests, and its
  replies in review threads, go in as context only. The summary says whether each earlier finding
  is fixed.
- **It reviews the pushes `@claude` makes.** `allowed_bots: "claude[bot]"` lets the review run on a
  push an `@claude` request made to the pull request, whose actor is then a bot.
- **Subagents stay in the foreground** (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`). Claude Code runs
  them in the background by default, and the action stops at Claude's first result, so a review
  would end having read nothing
  ([claude-code-action#1646](https://github.com/anthropics/claude-code-action/issues/1646)).
- **The model is pinned** (`--model claude-sonnet-5-5`), so an action update can't change it. The
  owner chose it; SERP's Token Budget asks for the strongest model for review, which is a row of
  [`harness-debt.md`](../harness-debt.md). `--strict-mcp-config` keeps `.mcp.json`'s servers, such
  as Chrome, out of CI. `--allowedTools` lists every tool in the skill's `allowed-tools`:
  `gh pr view`, `gh pr diff`, edits to the two files, Task, Read, Glob, and Grep. Naming Glob and
  Grep brings them back on Linux, where Claude Code otherwise searches with `grep` and `find` in
  Bash.
- **The settings never block what a CI job uses.** The action restores `.claude/` from the base
  branch, so the permissions in `.claude/settings.json` apply in CI, where an ask rule can't prompt
  and so denies; its hooks don't run (above). Its rules never deny or ask for a tool a Claude job
  uses: the tools in each job's `--allowedTools`, Read, Glob, and Grep, `git push` to a branch
  other than `staging` or `main`, the action's own push script, and `gh pr create`.
  `tests/unit/config/agent-tooling.test.ts` checks both directions, and
  `tests/unit/workflows/claude-guards.test.ts` that every Claude job turns hooks off.
- **The check fails unless the whole change was reviewed.** After the review, a script fails the
  job when Claude left no log, ended in an error, ended with subagents still running, or nothing
  was posted during the run, saying whether Claude wrote its summary; a denied tool fails it only
  when nothing was posted. It also fails when Claude started fewer than the skill's three
  reviewers, or when the summary posted during the run has no `Read <N> of <M> changed files.`
  line, counts a different M than the pull request has, or leaves files unread without naming
  them on a `Not read:` line. It counts only what the workflow posted, the summary and top-level
  inline comments, and not an answer to an `@claude` request. It runs when the review step fails
  too, and shows what Claude said, such as the API refusing the token (Claude's app and token,
  below). It runs inline, as the job's other scripts do, and Claude's hooks are off, so nothing in
  the job runs a script from the pull request with its token.
- **A pull request from a fork fails with a notice.** GitHub gives it no secrets, so Claude can't
  review it; the job says so and fails rather than passing with no review. A member reviews it, or
  pushes its branch to this repository and opens the pull request from there.
- **The transcript is kept** for a week as the `claude-review-transcript` artifact: the action's own
  log shows counts only. The step summary shows each run's turns, time, estimated cost, and models.

The inline scripts are tested by running them as the workflow does, against a stand-in for the
GitHub API: `tests/unit/workflows/code-review.test.ts`, `tests/unit/workflows/code-review-guard.test.ts`,
and, for what every Claude job shares, `tests/unit/workflows/claude-guards.test.ts`. The job runs
with the `CLAUDE_CODE_OAUTH_TOKEN` repository secret; without it the job only notes that it
skipped (Claude's app and token, below).

## @claude requests

`.github/workflows/claude.yml` answers `@claude` in an issue as it's opened, a pull request
comment, a review, or a review comment, from the repository's owners, members, and collaborators,
and never from a bot, so Claude's own comments can't start it again. It doesn't start when an
issue is assigned: the action answers an assignment only to the user its `assignee_trigger` names,
which this workflow doesn't set. The repository is public, so the job checks the
commenter's association before it does anything: otherwise a stranger's `@claude` on their own
fork's pull request would check out and install that pull request with the job's tokens. It also
skips, with a notice, a pull request whose branch is in a fork, whoever asks: checking it out would
run the fork's code with this repository's tokens, and Claude can't push to it. One run per issue
or pull request goes at a time, and a new one waits rather than cancelling it. The job, not the
workflow, holds that queue, so a comment that doesn't ask can't displace a waiting request. GitHub
keeps only one waiting run per queue, though: a third request while one runs and one waits replaces
the waiting one, so ask again after the first finishes.

- **Where it works.** On a pull request it checks out the pull request's head and may push fixes
  to its branch, which starts a re-review (Code review, above); on an issue it branches from
  `staging` and links a pull request to open. It sets up pnpm and Node as CI does and installs the
  dependencies without their scripts
  (`pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile`), so no install script,
  pnpmfile, or git hook from the pull request runs. The workflow's file is `main`'s while the
  checkout is the branch's, so on a branch from before `.node-version` it takes `staging`'s copy
  and keeps it out of what git sees there. The checkout keeps no token in the working tree
  (`persist-credentials: false`); the action sets up its own for pushing. It runs the pull
  request's own code when it checks it, so ask it only on a pull request whose code you trust.
- **The rules it follows.** A file appended to its system prompt says to follow `AGENTS.md`,
  `ARCHITECTURE.md`, [`code.md`](code.md), and `CONTEXT.md`; to run `pnpm run check` before
  pushing, with the faster checks while it works, and to push nothing and say why if it still
  fails; that the browser tests can't run on the runner, so it says so; to stage files by path; to
  add no attribution; and never to push to `main` or `staging`. Blanket adds (`git add -A`, `.`,
  `./`, `:/`, `-- .`, `-u`, `git stage`, and `git commit -a`) are refused with
  `--disallowedTools`: on a pull request the action resets `.claude/`, `.mcp.json`, and
  `CLAUDE.md` to the base branch's copies, and a blanket add would commit that reset. The job sets
  the placeholder `BETTER_AUTH_SECRET` CI sets, which `pnpm run check` needs.
- **Its limits.** `--max-turns 60`, a 45-minute timeout, and `BASH_DEFAULT_TIMEOUT_MS` of 15
  minutes, since `pnpm run check` takes about ten. Like the review, it pins the model, runs no
  hooks, keeps subagents in the foreground, leaves the MCP servers out, and keeps its transcript
  (`claude-transcript`).
- **The check after it.** A script reads Claude's log and the branch. It passes when Claude
  answered in its comment or pushed, fails when Claude did neither, ended in an error or with
  subagents running, or pushed a commit with attribution, and warns when a commit changes a file
  the action resets or Claude pushed without replying (`tests/unit/workflows/claude.test.ts`).

It runs on the same `CLAUDE_CODE_OAUTH_TOKEN` as the review, and pushes and comments as Claude's
app (below).

## Weekly maintenance

`.github/workflows/maintenance.yml` runs every Monday at 14:00 UTC, and by hand from the Actions
tab, where "Which job to run" picks one job or all of them. Each job checks out `staging` with its
full history and starts from `pnpm run maintenance:report` (`scripts/maintenance-report.ts`), a
Markdown report built only from the repository: what each check of `pnpm run verify` prints when
it fails; the docs whose named or linked files changed after the doc was last edited, leaving out
ADRs and the docs a tool writes; the rows of [`quality.md`](../quality.md) whose Code changed after
their Graded date ("Scores to re-grade"); the known debt in [`tech-debt.md`](../tech-debt.md) and
[`harness-debt.md`](../harness-debt.md), counted by Size, with the first small item named; the
exception lists, the docs over their size budget among them; the code files within 50 lines of
the 500-line limit; and the product behaviors whose check line says "No automated check yet". A
job writes it under `tmp/`, which git ignores: a Markdown file at the repository root would fail
the docs check the report runs.

Every job sets the placeholder `BETTER_AUTH_SECRET` CI sets, which the checks need. The gardening
jobs install the dependencies as CI does but run no git hook (`LEFTHOOK=0`): the pull request each
opens runs every check in CI, a hook would only repeat them, and a hook that failed on something
already broken on `staging` would stop a docs pull request that didn't break it.

- **`doc-gardening`**: unless a `chore/doc-gardening-` pull request into `staging` is still open,
  which the job checks before it checks anything out, Claude takes up to eight docs from the
  report, checks each against the code, and fixes what's no longer true, in Markdown only: never
  an ADR, a doc a tool writes, code, or a workflow. It re-grades each row under "Scores to
  re-grade" and sets its Graded date, even when the grade stays the same, and updates the debt
  files. It runs `pnpm run verify docs` and opens one pull request into `staging`
  from `chore/doc-gardening-<date>`, with its body written to `tmp/pr-body.md`: each doc changed,
  each row re-graded with its old and new grade, and the docs checked without changes.
- **`code-gardening`**: unless a `chore/code-gardening-` pull request is still open, Claude fixes
  one item in one pull request into `staging`: the first `small` row of the debt files, or else
  one file near the size limit, split by responsibility. It passes over an item that needs a
  migration, production or Staging data, a deploy, billing or Stripe, a change to a product doc's
  behavior or wording, an ADR-level decision, or another decision a person makes. It deletes the
  row it fixed, writes no code comments, runs `pnpm run check`, and opens a pull request from
  `chore/code-gardening-<date>` that closes the row's issue or says `No issue:`, or it says
  "Nothing to garden". It has 60 minutes.
- **`report`** posts the report as one open issue, "Weekly repository maintenance", labelled
  `chore` and `ready-for-agent`, and edits it each week rather than opening another. It looks the
  issue up among those `github-actions[bot]` opened, so it never edits a stranger's issue of the
  same title. It first
  collects what the review commented inline in the last four weeks (`tmp/review-findings.json`),
  so its report can group the findings by the part of the repository and name a part with three
  or more across two or more pull requests as repeated (`scripts/lib/review-findings.ts`). The
  gardening jobs' reports, and one built by hand, say the findings weren't collected. It has 15
  minutes.

Both gardening jobs pin the model, run no hooks, keep subagents in the foreground, give each Bash
command 15 minutes (`BASH_DEFAULT_TIMEOUT_MS`), leave the MCP servers out, add no attribution (the
`attribution` setting and the prompt, since the model otherwise adds a Co-Authored-By trailer by
habit), and keep their transcripts (`doc-gardening-transcript`, `code-gardening-transcript`). A
script after each prints what Claude said and passes only on an outcome. Doc gardening's: one
gardening pull request opened during the run, or "No doc drift found". Code gardening's: one pull
request opened, or "Nothing to garden". Both fail on a second pull
request, on attribution in the pull request or its commits, and when Claude left no log, ended in
an error or with subagents running, or reached no outcome; a denied tool only warns when Claude got
there anyway, since it often retries a refused command another way
(`tests/unit/workflows/maintenance.test.ts`). The review reviews their pull requests too: read it,
then merge.

Work the issue in small pull requests, one item each:

1. **Checks and docs:** fix a failing check, or a doc the gardening pull request left unresolved.
2. **Scores:** re-grade a row under "Scores to re-grade" and set its Graded date.
3. **Debt:** pay down one row of a debt file, and delete it.
4. **Size:** split one file the report lists as near the 500-line limit, by responsibility.
5. **Behaviors:** write the test for a behavior the report lists, and name it on the behavior's
   check line.
6. **Harness:** for a part the report lists as repeated under "Review findings", read its
   findings; when they share a cause, add the rule to [`code.md`](code.md) and, where possible, a
   check whose message says how to fix it. A rule only prose holds gets a row in
   [`harness-debt.md`](../harness-debt.md).

The gardening jobs run with `CLAUDE_CODE_OAUTH_TOKEN` too, and skip without it; the report needs
no token.

## Claude's app and token (admin only)

`@claude` and the gardening jobs authenticate to GitHub as the Claude GitHub App, since a push or
pull request made with the job's own token starts no workflow; the review uses the job's token.
All three run on a Claude subscription. An admin sets them up once:

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository. The action
   pushes and comments as the app (`claude[bot]`).
2. On a machine with Claude Code signed in to a Pro, Max, Team, or Enterprise plan, run
   `claude setup-token`, and save the token it prints as the repository secret
   `CLAUDE_CODE_OAUTH_TOKEN`.

The token belongs to whoever generated it: every run counts against their plan's usage limits,
beside the Actions minutes, and every push to a pull request is reviewed. The owner hasn't yet
named the admin who keeps it. If that person's plan changes, or runs start failing to
authenticate, regenerate it and replace the secret.

A revoked or expired token ends every review, `@claude`, and gardening run within seconds, after one
turn, with no cost and no model used. The check after each Claude step runs even when that step
fails, and on a 401 it fails with the API's message, such as "OAuth token revoked", and says to
renew the token; when the step failed before Claude ran, it says to read that step's log
(`tests/unit/workflows/claude-guards.test.ts`). To renew it, run `claude setup-token`, then
`gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo serpcompany/serplists.com` and paste the token, then
re-run a pull request's `review` job to confirm it.
