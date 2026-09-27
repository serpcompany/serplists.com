# Agent Workflow

How work moves from an issue to production, and how the repo is kept clean.

## From issue to merged PR

1. Pick an issue labeled `ready-for-agent`. If acceptance criteria are unclear, ask
   on the issue and label it `needs-info`.
2. Branch from `staging`. For multi-step work, add a plan under
   `docs/exec-plans/active/` ([PLANS.md](../PLANS.md)).
3. Reproduce first: `pnpm run setup`, `pnpm run dev:all`, then confirm the bug or
   current behavior with `pnpm run ui:snap` or a failing test
   ([development environment](development-environment.md)).
4. Make the change with tests. Run `pnpm run verify` before opening the PR.
5. Open a PR into `staging` and fill in the template, including evidence for UI changes.
6. Review loop: review your own diff first. Claude then reviews the PR automatically
   (see [Claude code review](#claude-code-review)). Address every comment: fix it, or
   reply explaining why not. Humans may review but are not required to for routine
   changes.
7. Merge when CI is green ([quality gates](../RELIABILITY.md#quality-gates)).

Promotion to production is a PR from `staging` to `main`; CI runs the full browser
suite on it and deploys after merge.

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
`.github/workflows/maintenance.yml` runs every Monday (or on demand) and opens or
refreshes the issue "Weekly repository maintenance" (`chore`, `ready-for-agent`)
with the output of `pnpm run maintenance:report`: docs-check results, docs whose
referenced code changed since they were edited, recorded debt in the baselines,
oversized files, stale active plans, open tech debt, and the quality-score date.

Work it in small PRs, one item each:

1. **Docs:** re-read each listed doc against the code, fix what is no longer true,
   and update its "Last verified" date in [the design-docs index](index.md).
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
`code-review` plugin on every non-draft PR (opened, updated, reopened, or marked
ready). Claude posts an inline comment for each high-confidence issue, or one summary
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
