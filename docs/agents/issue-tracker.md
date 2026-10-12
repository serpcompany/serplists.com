# Issue tracker

How work moves from an issue to a merged pull request, and the labels issues carry.


## From issue to merged PR

1. Pick an issue labeled `ready-for-agent`. If acceptance criteria are unclear, ask
   on the issue and label it `needs-info`.
2. Branch from `staging`. For multi-step work, add a plan under
   `docs/exec-plans/active/` ([PLANS.md](../exec-plans/plans.md)).
3. Reproduce first: `pnpm run setup`, `pnpm run dev:all`, then confirm the bug or
   current behavior in Chrome with the `verify-web` skill (recording it), with
   `pnpm run ui:snap`, or with a failing test
   ([development environment](development-environment.md), [agent tooling](agent-tooling.md#agent-tooling)).
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
   (see [Claude code review](ci-agents.md#claude-code-review)). Address every comment: fix it, or
   reply explaining why not. Humans may review but are not required to for routine
   changes.
7. Merge when CI is green ([quality gates](checks.md#quality-gates)).

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
