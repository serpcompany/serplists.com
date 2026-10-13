# Runs follow their Template

How a Template's changes reach the Runs started from it, when a Run is stale, how Revalidate
brings one up to date, and which Templates a Run may copy from. How the API stores ids and
reconciles is in
[data persistence](../agents/data-persistence.md#stable-ids-and-run-reconciliation).

Abbreviations: **Template saves** is `tests/unit/functions/api/templates-handler.reconcile.test.ts`,
**Reconciliation** is `tests/unit/functions/api/template-reconciliation.test.ts`,
**Reconciling moves** is `tests/unit/functions/api/template-reconciliation.moves.test.ts`,
**Retired reconcile** is `tests/unit/functions/api/template-reconciliation.retired.test.ts`,
**Removed work** is `tests/unit/components/RetiredRunItems.test.tsx`, **Removed work spec** is
`tests/e2e/run-retired-items.spec.ts`, **MCP run reads** is
`tests/unit/functions/api/agent-mcp-handler.get-run.test.ts`, **Share API** is
`tests/unit/functions/api/checklists-handler.sharing.test.ts`, **Revalidate API** is
`tests/unit/functions/api/checklists-handler.revalidate.test.ts`, **Reopen limit** is
`tests/unit/functions/api/checklists-reopen-limit.test.ts`, **Stop sharing API** is
`tests/unit/functions/api/checklists-share-revoke.test.ts`, **Source on D1** is
`tests/integration/run-source-access-local-d1.test.ts`, **Revalidate refusals** is
`tests/unit/functions/api/checklists-revalidate-source-d1.test.ts`, and **Edit conflicts** is
`tests/unit/lib/editConflicts.test.ts`.

## Template changes reach active Runs

Template content updates reconcile into the matching active, private Runs of the same Resource
Owner. Completed, archived and publicly shared Runs are frozen when a Template changes.

- Check: Template saves, "should reconcile active private runs without losing completion or notes"
  and "still reconciles active runs when the checklist structure changes".

Stable section, item and sub-item ids preserve run completion and notes across renames and
reordering. New work arrives incomplete, and retired work leaves readiness calculations while it
stays in the Run's history.

- Check: Reconciliation, "preserves run-owned state by stable identity while applying additions,
  renames, reorders, and removals" and "archives removed sub-items without counting them toward
  readiness".

The same holds when a task moves to another section, or a Sub-task to another task, since ids are
unique across the Template.

- Check: Reconciling moves, "keeps the state of a task moved to a later section and retires
  nothing" and "keeps the state of a Sub-task moved to a task in another section".

A legacy Run that repeats an id in several sections matches each copy only in its own section.

- Check: Reconciling moves, "still matches each copy in its own section" and "never guesses which
  copy moved to another section".

A task with Sub-tasks is complete exactly when all of them are (the run page, Run Keys,
reconciliation and revalidation apply the same rule), so a new Sub-task reopens a completed task
and removing its last unfinished Sub-task completes it. A task left without Sub-tasks keeps its
state, and the completion prompt also waits for every Sub-task.

- Check: Reconciliation, "reopens a completed task when the template adds a Sub-task to it",
  "completes a task when its only unfinished Sub-task is removed" and "keeps the run state of a task
  whose Sub-tasks are all removed".

## Removed work

Retired sections, tasks and Sub-tasks keep their completion and notes, and appear read-only under
"Removed from Template" on the run page.

- Check: Removed work, "shows each removed task with its completion and notes, read-only".

So notes on a task removed from the Template stay visible on the Run.

- Check: Removed work spec, "notes on a task removed from the Template stay visible on the Run".

The Run Key `get_run` tool returns them as `retiredItems`, read in full a page at a time
([Run Keys](run-keys.md#results-and-paging)), while `list_runs` stays small.

- Check: MCP run reads, "returns retired work from get_run but keeps list_runs small".

Shared run links leave them out: their notes were written while the Run was private.

- Check: Share API, "leaves retired work out of shared runs: its notes were written while the run
  was private".

When a later Template version brings a retired id back, its run state comes back with it.

- Check: Retired reconcile, "restores a retired task with its notes and completion when the
  Template brings its id back" and "restores retired sections and Sub-tasks by id".

Each reconcile that changes a Run adds an "Updated from Template" entry to the Run's Activity,
naming the retired work but never its notes.

- Check: Template saves, "records a reconciled event on each run whose work changed, naming what it
  retired but never its notes, on the run update's own condition".

Revalidate records the same.

- Check: Revalidate API, "names the work a revalidate retired in its Changelog event".

## Staleness and Revalidate

Runs record both the Template content version they last reconciled and a run revision. API
responses expose `is_stale` when the source checklist structure is newer; metadata-only Template
edits do not stale Runs.

- Check: Template saves, "saves metadata edits without bumping content_version or rewriting runs".

A completed private Run can be explicitly reconciled and reopened with
`POST /api/checklists/:id/revalidate`, which applies the same Sub-task rule.

- Check: Revalidate API, "explicitly revalidates a completed run against the current template" and
  "revalidates a completed run so a task with a new Sub-task is no longer complete".

Reopening it counts toward the active-run limit like starting a Run.

- Check: Reopen limit, "refuses to revalidate a completed run at the limit" and "revalidates a
  completed run below the limit".

A shared Run is a frozen snapshot: revalidating it points to Stop sharing first.

- Check: Stop sharing API, "points revalidation of a shared run at Stop sharing".

Runs that predate stable identities are conservatively marked stale during migration. Their legacy
ids are backfilled deterministically, and their completion and notes remain intact until explicit
reconciliation.

- Check: Reconciliation, "preserves legacy id-less progress on the first template evolution,
  reopening a task that gains an incomplete Sub-task" and "normalizes a legacy flat run before
  reconciling its first sectioned template edit".

## The run source rule

A Run copies Template content, at creation and at revalidation, only from a source the caller may
still use: a public Template, the caller's own Personal Template, or a Template of the Run's own
Organization.

- Check: Source on D1, "refuses to copy a now-private template into another user's run, keeping the
  run and naming its source unavailable for the page", "refuses to copy a member's Personal
  template into an Organization run for another member" and "still revalidates from a public
  template and from the caller's own template".

A Run whose source is no longer usable (made private by its owner, or archived) is not reported
stale for that caller.

- Check: Source on D1, "reports staleness only for sources the caller may use".

Revalidating it returns `404 source_template_unavailable`, the same answer whether the Template is
gone or private.

- Check: Source on D1, "refuses to revalidate from an archived template, saying the template is
  unavailable".

A missing or archived Run gets a plain `404` with no code, so the page can tell the two apart.

- Check: Revalidate refusals, "gives a missing or archived run a plain 404 with no code".

The runs list then reloads and says the Run's Template is no longer available, not the Run.

- Check: Edit conflicts, "says the template is gone, not the run, when only the source template is
  unavailable" and "counts a run whose template is no longer usable as stale too, so the runs list
  reloads and stops offering Revalidate".
