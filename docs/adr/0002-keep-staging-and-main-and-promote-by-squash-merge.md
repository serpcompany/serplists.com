---
status: accepted
---

# Keep `staging` and `main`, and promote by squash-merging a prepared branch

Work merges into `staging`, which deploys Staging. `main` is Production and stays the GitHub
default branch. Accepted work reaches `main` by promotion: `pnpm run promote:prepare` pushes a
`promote/staging-<date>-<sha>` branch whose files are exactly `staging`'s, with `main` recorded as
merged, and the promotion pull request into `main` is squash-merged. The script refuses to run
while `main` holds a change `staging` lacks, such as a hotfix, and lists its files; that change
reaches `staging` through a normal pull request first.

This holds until the owner decides otherwise, with Devin. Recorded on 2026-10-12, from the
promotions since #201 and the harness audit of that day.

## Why

- **The two histories have already parted.** Every promotion so far was squashed (#201, #218,
  #222, #227, #243, #252, #295), and #254, a hotfix, merged into `main` directly, so `main`'s
  commits are not `staging`'s. SERP's Git Workflow promotes with a fast-forward, which needs
  `main` to be an ancestor of `staging`: it would take one reset of the production branch onto
  `staging`'s history, a force push, and a merge back into `staging` after every hotfix from then
  on.
- **Both branches require linear history,** so a promotion can't be a merge commit either.
- **The prepared branch merges cleanly.** Its one commit has `staging`'s tree and both branches as
  parents, so the pull request conflicts nowhere, the squash commit on `main` holds exactly what
  Staging ran, and nothing has to be merged back.
- **`main` stays the default branch** because moving it moves what runs from the default branch:
  the weekly schedule, the workflows that issue and pull request comments start, and the review
  action's check of its own workflow file all follow it to `staging`. That move is the owner's.

## Considered

- **SERP's flow:** `staging` as the default branch, promoted to `main` by fast-forward, with a
  merge commit for a diverged promotion and a merge back. It needs the one-time reset above, and
  admin settings this repository doesn't have yet.
- **One pipeline from `main`,** as zenbujapanese-monorepo runs: no `staging` branch, every merge
  deploying Staging and then Production. It needs a merge queue and Production waiting on a
  verified Staging, neither of which exists here.
- **A merge commit per promotion** and a merge back: refused by linear history.

## Consequences

- `main`'s history is a list of promotions, one commit each, titled for what they ship; each
  change's own commit is on `staging`.
- GitHub links a pull request to the issues it closes only when it targets the default branch, so
  `Closes #N` in a pull request into `staging` closes nothing. An issue closes by hand, or when a
  promotion pull request names it ([`harness-debt.md`](../harness-debt.md), Delivery).
- Workflows that comments or schedules start run `main`'s copy, so a change to one takes effect
  for those events only once it is promoted.
- A hotfix on `main` is followed at once by a pull request that brings it into `staging`, or the
  next promotion can't be prepared.
- How a promotion is opened and checked is in [`issue-tracker.md`](../agents/issue-tracker.md) and
  [`ci-deploys.md`](../agents/ci-deploys.md).
