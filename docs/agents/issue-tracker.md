# Issue tracker: GitHub

Issues for this repository live in `serpcompany/serplists.com`, and plans live in issues too. Use
the `gh` CLI, which finds the repository from the clone. Write a long body to a file under
`tmp/agent/scratch/` first and pass it with `--body-file`.

- **Create:** `gh issue create --title "..." --body-file <file>`
- **Read:** `gh issue view <number> --json number,title,body,state,labels,assignees,comments,url`
- **List:** `gh issue list --state open --json number,title,labels --limit 100`, with `--label`
  to filter
- **Comment:** `gh issue comment <number> --body-file <file>`
- **Labels:** `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close:** `gh issue close <number> --comment "..."`, with `--reason "not planned"` for work
  that won't be done

GitHub shares one number space between issues and pull requests: for `#42`, try
`gh pr view 42` and fall back to `gh issue view 42`. When a skill says "publish to the issue
tracker", create an issue; "fetch the relevant ticket" means `gh issue view`.

## What an open issue means

An open issue means work is left to do. SERP's
[Git Workflow](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/git-workflow.md#issues)
has the rules: an issue stands alone, so a fresh session can finish it from its text; one pull
request closes each; a check that waits until after a merge (a look at Production, a measurement
after a day of use) gets its own issue; and work that ends without a merge closes its issue with
the reason. Here:

- **Split work that needs several pull requests into sub-issues,** one pull request each. The pull
  request that closes the last sub-issue also closes the parent. `Part of #N` and `Refs #N` close
  nothing, and the `Pull request` workflow fails a pull request that names no issue
  ([`ci.md`](ci.md#pull-request)).
- **An idea with no acceptance criteria carries `brainstorm`** until it has them, so no agent picks
  it up.
- **A plan lives in a map issue, not in the repository.** Larger work gets an issue labelled
  `epic` with its sub-issues in order and GitHub's "blocked by" links (Map issues, below). It
  keeps four sections current: Progress, Surprises, Decision log, and Outcomes. A decision the
  owner gives in chat goes onto its issue in the same turn, since a chat ends with its session.
  A decision that is hard to reverse also gets an ADR in [`docs/adr/`](../adr/).
- **Close an issue only when every acceptance item is done,** shown by file and line on `staging`
  or by a run. One that is partly done stays open: tick what is finished and comment with what is
  left, after opening an issue for any of it that is tracked nowhere else.

## From issue to merged pull request

1. Pick the first open issue labelled `ready-for-agent`, or the first open, unblocked sub-issue
   of a map issue. One whose criteria are unclear gets a question and `needs-info`.
2. Branch from `staging` as `<type>/<issue>-<slug>`, and keep it up to date by merging `staging`
   into it ([`code.md`](code.md#pull-requests)).
3. Reproduce first (a failing test, or the `verify-web` or `verify-api` skill), make the change
   with its tests, and finish it with the `finish-change` skill.
4. Open the pull request into `staging` from the template, a hotfix included: only a promotion
   goes into `main`. The `Pull request` workflow checks that, its Conventional Commit title, its
   first line (`Closes #<number>` or `No issue: <reason>`), a test in a `fix:`, and a line of
   text for each evidence level ([`ci.md`](ci.md#pull-request)). The code review workflow
   reviews every push ([`ci-agents.md`](ci-agents.md)); answer every finding. The owner merges:
   agents never do.

## How issues close here

The base branch is `staging`, while GitHub's default branch is `main`, and GitHub links a closing
keyword only on a pull request into the default branch
([ADR 0002](../adr/0002-keep-staging-and-main-and-promote-by-squash-merge.md)). So:

- A pull request into `staging` starts its body with `Closes #<number>`, a line per issue it
  finishes, or `No issue: <reason>`. The `Pull request` workflow checks that each number is an
  issue. The merge closes nothing yet.
- `pnpm run promote:prepare` writes the promotion's body to `tmp/promotion-body.md`, with one
  `Closes #<number>` line for each issue the promoted pull requests closed, and prints how to open
  it: `gh pr create --base main --head <branch> --title "chore: promote staging <sha> to main"
  --body-file tmp/promotion-body.md`. Merging the promotion into `main` closes them all
  ([`ci-deploys.md`](ci-deploys.md#promotion)).
- So an issue whose change is on `staging` but not yet promoted stays open, and that is expected.
- A hotfix takes the same path: a pull request into `staging`, then a promotion as soon as
  Staging's deploy of it passes, which closes its issue. Production deploys only files Staging
  has deployed and checked, so the `Pull request` workflow fails a pull request into `main` that
  isn't a promotion ([`ci-deploys.md`](ci-deploys.md#production-waits-for-staging)).

## Labels

Every label `gh label list` shows is here. A new label is added to this table when it is created;
a label nobody documented is deleted or written down.

| Label | Meaning |
| --- | --- |
| `needs-triage` | A maintainer needs to evaluate the issue. Every new issue starts here. |
| `needs-info` | Waiting on the reporter for something the issue names. |
| `ready-for-agent` | Fully specified: an agent can finish it alone. The weekly maintenance report's issue carries it, with `chore`. |
| `ready-for-human` | Needs a person: a decision, an admin setting, live keys, or access an agent doesn't have. |
| `brainstorm` | An idea with no acceptance criteria yet, ready for nobody. It loses the label when it gets them. Not created yet: `gh label create brainstorm` with the first issue that needs it. |
| `wontfix` | Won't be done; the issue is closed with the reason. |
| `duplicate` | Closed in favor of the issue its comment names. |
| `waiting` | Blocked on another issue, a person or an outside party, named in a comment. |
| `epic` | A map issue: a plan with sub-issues in order (Map issues, below). |
| `bug`, `feature`, `chore`, `refactor`, `docs`, `ux` | The kind of change. A failed deploy's issue (`Staging deploy failed`, `Production deploy failed`) is a `bug` ([`ci-deploys.md`](ci-deploys.md#a-failed-deploy-opens-an-issue)). |
| `research` | The issue can't be specified until something is found out. |
| `SRE`, `seo`, `security risk` | The area: CI, deploys and environments; search and public pages; a security risk or a chance to reduce one. |
| `enhancement`, `documentation` | Delete (admin): GitHub's defaults, duplicating `feature` and `docs`. No open issue carries them. |
| `question`, `reference`, `website` | Delete (admin): a question or a reference note isn't work left to do, and every issue here is about the website. No open issue carries them. |
| `sesh`, `skip` | Delete (admin): `brainstorm` and `wontfix` replace them. No issue carries them. |
| `status: implementation`, `status: verification pending`, `status: external proof blocked` | Delete (admin): from the earlier remediation flow. A check after a merge now gets its own issue, and work that needs a person is `ready-for-human`. No open issue carries them. |

## Triage

1. A new issue gets `needs-triage`.
2. Read it as a fresh agent would. It ends with exactly one of: `needs-info` (with the question on
   the issue), `brainstorm`, `ready-for-agent`, `ready-for-human`, or closed as `wontfix` or
   `duplicate` with the reason.
3. Give it its kind (`bug`, `feature`, `chore`, `refactor`, `docs`, `ux`) and an area when one
   fits. `waiting` stays on while it's blocked, naming what it waits for.

Pull requests are not a triage surface: an outside pull request is reviewed as a pull request,
not filed as a request.

## Map issues

A map issue (`epic`) holds the plan: the outcome, the sub-issues in order, and the four sections.
Next up is always its first open sub-issue with no open blocker. The `gh api` writes below ask
first (`.claude/settings.json`), as they change the tracker.

- **A sub-issue:** get the child's database id with
  `gh api repos/serpcompany/serplists.com/issues/<child> --jq .id`, then
  `gh api --method POST repos/serpcompany/serplists.com/issues/<map>/sub_issues -F sub_issue_id=<id>`.
- **Blocked by:** `gh api --method POST repos/serpcompany/serplists.com/issues/<blocked>/dependencies/blocked_by -F issue_id=<id of the blocker>`.
  A sub-issue is unblocked when every blocker is closed.
- **Claim one:** `gh issue edit <number> --add-assignee @me`.

## The issue audit

Run it when the owner asks, or when the open issues no longer match the work. It is read-only
until the owner approves the report, and its steps are SERP's
[Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md#issue-audit):
each issue's acceptance items, leads (closing pull requests, mentions, sub-issues), each item
confirmed on `staging` with file and line, and a verdict. Here, an issue whose change is on
`staging` but not yet in `main` is done and waits for the promotion that closes it; leave it open.
Never close one that is partly done or can't be judged without the running app or the owner, and
leave an issue its author opened recently to its author.
