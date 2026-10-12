---
name: finish-change
description: Take a SERP Lists change from "the code works" to "ready for a pull request", and clean up after it merges. Runs the finish gate (pnpm run check) once on the finished tree, shows the change working (verify-web, verify-api, the browser specs it touches), has a fresh subagent review the diff from SERP's Review Prompt, brings the product docs and their check lines, the area doc, the quality grade, the debt rows and any ADR in line, drafts the pull request from the template, and after the merge runs housekeeping. Use before opening or updating a pull request, after answering review feedback, and after a merge.
---

# Finish a change

A change is done when `docs/agents/code.md` says it is; this is the loop that gets it there. Stop
and ask the person only when a step needs their judgment: a product decision, a rule that seems
wrong, or anything outward-facing (a push, a pull request, a comment). Agents never merge.

## 1. Check it

Run `pnpm run check` from the repository root, in the background, with its output in a file under
`tmp/agent/scratch/`. It is the finish gate: the environment, `pnpm run verify`, lint, the type
checks, the unit and local D1 tests, and schema parity, one after another. Run it once on the
finished tree, and cite that run rather than repeat it while nothing has changed
(`docs/agents/verification.md`). Fix what fails and run what failed again; never loosen a check
or add an exception to pass it. A rule that really can't be met goes to the person, with why.

## 2. Show it working

Keep each run's proof under `tmp/agent/verify/<date>-<what>/` for the pull request.

- A page, component, route, redirect or header: the `verify-web` skill, and the browser specs the
  change touches, at low priority:
  `node --import tsx scripts/run-at-low-priority.ts pnpm run test:e2e:full <specs>`. Add a spec
  for what the change adds, and one that fails without the fix for a bug (the `browser-tests`
  skill).
- An API route, an error answer, Run Keys or an MCP tool: the `verify-api` skill.
- A deploy, routing, or a smoke test: the deploy to Staging and its smoke test, after the merge
  (`docs/agents/ci-deploys.md`). Say in the pull request that it waits for that.

## 3. Review the diff with fresh eyes

Start a subagent that has not seen the work, with SERP's
[Review Prompt](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/agent-harness/review-prompt.md)
as its instructions. No pull request exists yet, so fill the prompt in with the issue
(`gh issue view <number> --json title,body,comments`), the checkout and branch, the diff
(`git diff origin/staging...HEAD` plus the uncommitted diff), and steps 1 and 2 as the cited
evidence, and ask it to return its findings as its final answer instead of posting a review.
Add to its list:

- a layer rule broken in spirit where no lint catches it (`ARCHITECTURE.md`);
- data read without a Zod schema where it enters: a request body, an answer, a file, storage;
- a helper that duplicates one the repository already has;
- a doc that no longer matches the code, or a changed behavior without its check line.

Fix what holds up, then start another fresh reviewer on the commits since, until a round has no
blocking finding. Count the rounds for the pull request.

## 4. Bring the records in line

- `docs/product/`: each behavior the change adds or changes, followed by its `- Check:` line naming
  the test that proves it, or `- No automated check yet.`
- The area's doc in `docs/agents/` that `AGENTS.md` routes to, for how it works.
- The area's row in `docs/quality.md` when its tests, CI or docs changed, graded today.
- `docs/tech-debt.md` (the code) or `docs/harness-debt.md` (checks, delivery, the harness): a row
  for debt the change knowingly leaves, and the rows it pays off deleted.
- An ADR in `docs/adr/` for a decision that is hard to reverse, surprising without context, and the
  result of a real trade-off. An ADR is never rewritten: a new one supersedes it.

## 5. Draft the pull request

Into `staging`, from the issue's branch (`docs/agents/code.md`, Pull requests). Give it a
Conventional Commit title that names the outcome a user notices, and fill in
`.github/pull_request_template.md` for a reviewer who hasn't seen the work: `Closes #<number>`, or
a first line `No issue: <reason>`, deleting the other line; why; what changed; what was left out
and who can finish it; the evidence by level (`docs/agents/verification.md`, Evidence); the
review (`Review: 2 rounds, clean`); and the status a fresh agent would start from. Every evidence
line gets text after its colon, and a level that doesn't apply says so (`UI tests: none, no screen
changed`): the `Pull request` workflow fails an empty one, as it does a title without a type, a
first line that isn't `Closes #` or `No issue:`, and a `fix:` with no test (`docs/agents/ci.md`,
Pull request). Write the body to `tmp/pr-body.md` and pass `--body-file`. Show it to the person
before pushing or opening anything, and mark a draft ready only after the last push's checks have
started.

Once it's open, the code review workflow reviews every push (`docs/agents/ci-agents.md`). Answer
each finding (fix it, or reply with why not), then run this skill again before the next push.

## 6. After it merges

Finished work leaves nothing behind (SERP's
[Housekeeping](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/housekeeping.md)):

- The issue closes when the promotion carrying the change merges into `main`
  (`docs/agents/issue-tracker.md`, How issues close). Until then it stays open; after it, check:
  `gh issue view <number> --json state`.
- Stop what the work started: `pnpm run dev:stop`, and a preview's whole process tree. In a
  worktree, `pnpm run ports delete` gives up its block of ports, and `pnpm run ports prune` those
  of worktrees that are gone.
- Run the housekeeping script's audit, read every bucket, then apply what it marks safe:
  `bash ~/.agents/skills/serp-housekeeping/scripts/housekeeping.sh`, and again with `--apply`. It
  comes with SERP's `serp-housekeeping` skill; without it, do by hand what the standard lists.
  `.housekeeping` names this repository's disposable paths; `tmp/backups/` (D1 exports) and
  `tmp/agent/verify/` (proof) aren't among them, so they stay until a person deletes them.
- Ask before deleting anything with uncommitted or unpushed work.
