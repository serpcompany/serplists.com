# Claude's workflows

The GitHub workflows that run Claude: the review of every pull request, `@claude` requests, and weekly maintenance.


## Weekly maintenance

Agents copy whatever patterns exist, including bad ones, so the repo is cleaned in
small steps every week instead of in occasional big cleanups.
`.github/workflows/maintenance.yml` runs every Monday at 14:00 UTC (or on demand from
the Actions tab, where "Which job to run" picks one job or all; scheduled workflows run
from the default branch). Each of its jobs checks out `staging` with its full history,
since the report compares each doc's last edit with the code it references, and starts from
`pnpm run maintenance:report`, which lists docs-check results, docs whose referenced code
changed since they were edited, [QUALITY_SCORE.md](../quality.md) rows whose code
changed since their Graded date ("Scores to re-grade"), open tech debt by Size with the
oldest small row, stale design docs and plans, and files near the size limit.

- **Doc gardening (automatic):** Claude re-checks up to 8 flagged docs against the
  code, fixes what is no longer true, re-grades each row under "Scores to re-grade" and sets
  its Graded date, updates "Last verified" dates, runs
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
- **Code gardening (automatic):** Claude fixes one item in one PR into `staging`: the
  oldest `small` row of the [tech debt tracker](../tech-debt.md) it may
  fix, or else one file near the size limit, split by responsibility. It passes over items
  that need a migration, production data, billing, product wording or another decision
  AGENTS.md leaves to a person, deletes the row it fixed, runs `pnpm run verify`, and opens
  a PR from `chore/code-gardening-<date>`, or says "Nothing to garden". It skips the week
  while its last PR is still open. A check after it passes only on one PR or "Nothing to
  garden", and fails on a second PR, on attribution in the PR or its commits, or on no
  outcome (`tests/unit/workflows/maintenance.test.ts`).
- **Report issue:** the full report is posted to the issue "Weekly repository
  maintenance" (`chore`, `ready-for-agent`) for the items below that need judgment. The job
  writes it to `tmp/weekly-report.md`: a Markdown file at the repository root would fail the
  docs check the report itself runs.

Work the issue in small PRs, one item each:

1. **Docs:** anything the gardening PR left unresolved; update its "Last verified"
   date in [the design-docs index]().
2. **Debt:** close one row of the
   [tech debt tracker](../tech-debt.md).
3. **Size:** split one file the report lists as near the 500-line limit, by
   responsibility.
4. **Plans:** update stale active plans or move finished ones to `completed/`.
5. **Scores:** re-grade [QUALITY_SCORE.md](../quality.md) rows whose code changed.
6. **Harness:** if recent PRs repeated a mistake, add it to
   [core beliefs](code.md) and, where possible, a lint rule or check whose
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
  change how it is reviewed. The workflow copies `AGENTS.md` and [core beliefs](code.md)
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
