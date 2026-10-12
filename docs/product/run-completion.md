# Completing a Run

How a Run is completed, why a completed Run is frozen, how it is reopened, and who is recorded as
its completer.

Abbreviations: **Complete dialog** is
`tests/unit/components/run-execution/RunCompleteDialog.dom.test.tsx`, **Double clicks spec** is
`tests/e2e/run-double-clicks.spec.ts`, **Completion view** is
`tests/unit/views/ChecklistRunCompletion.test.tsx`, **Completion spec** is
`tests/e2e/run-completion.spec.ts`, **Run page completion** is
`tests/unit/views/ChecklistRunPage.completion.test.tsx`, **Primary action** is
`tests/unit/features/run-execution/primaryTaskAction.test.ts`, **Completion rule** is
`tests/unit/functions/api/run-completion-rule.test.ts`, **Run updates** is
`tests/unit/functions/api/agent-mcp-handler.update-run.test.ts`, **Shared run API** is
`tests/unit/functions/api/checklists-shared-handler.test.ts`, **Freeze on D1** is
`tests/unit/functions/api/completed-run-freeze-d1.test.ts`, **Reopen limit** is
`tests/unit/functions/api/checklists-reopen-limit.test.ts`, **Completion stamps** is
`tests/unit/functions/api/checklists-completion-stamps.test.ts`, and **Revalidate API** is
`tests/unit/functions/api/checklists-handler.revalidate.test.ts`.

## Completing

Ticking every task does not complete a Run: the user confirms completion in the Run complete
dialog ("Complete this Run?": every task is done, and completing freezes the Run's tasks), with
"Complete Run" or "Not yet".

- Check: Complete dialog, "asks first, says every task is done and that completing freezes the
  tasks, with buttons that say what they do" and "RunCompleteDialog buttons".

While the completion saves, the dialog holds both answers and cannot be closed.

- Check: Complete dialog, "holds both answers while the completion saves" and "cannot be closed
  with Close or Escape while the completion saves, so the request is not left running behind it".

The dialog stays open through the rest of the double click that opened it.

- Check: Double clicks spec, "the rest of the double click that completes the last task keeps the
  completion dialog open".

Completing says "Run completed". A signed-in owner or member then goes to the Runs of the Run's
own context, and a guest on a share link stays on the shared Run, which shows it completed.

- Check: Completion view, "Completing a Run", "takes a member of the run's Organization to that
  Organization's Runs, whichever context is selected" and "keeps a guest on the shared run".

While every task is done and the Run is still in progress, the run page (private and shared)
offers a Complete run action, so a dismissed prompt, a reload, or tasks ticked over MCP never
leave a Run stuck in progress.

- Check: Completion spec, "a dismissed completion dialog can be reopened with Finish Run, and Not
  yet keeps the run in progress" and "a fully ticked run that is still in progress can be completed
  after a reload".

The shared run page offers it too.

- Check: Run page completion, "offers the finish action in the shared run view too".

A task is done only when its Sub-tasks are too. A ticked task that still has an open Sub-task
(older Runs, API writes) is where the Run opens, the last task's button leads to it ("Next
unfinished task"), and Mark Complete on it ticks the rest. Only a completed Run reads Run
completed.

- Check: Primary action, "leads from the last task to the earlier task with the open Sub-task" and
  "offers Mark Complete on the task with the open Sub-task, also when it is the last task".

## A completed Run is frozen

A completed Run is frozen on the run page and through its share link: its tasks and Sub-tasks can
no longer be ticked or unticked, so it never reads Completed with open tasks. Task notes stay
editable.

- Check: Completion spec, "a completed run cannot be unticked, privately or through its share
  link, and its notes stay editable".

Run Keys follow the same rule: MCP `update_run` with `set_run_status` `completed` fails with
`run_incomplete` (naming up to 20 open task ids) unless the Run has tasks and every task and
Sub-task is done. Marking an already completed Run completed again still succeeds.

- Check: Run updates, "names at most 20 open tasks", "completes a run whose every task and
  Sub-task is done, legacy completed keys included" and "keeps the original completion stamps when
  a completed run is marked completed again".

Complete run and `set_run_status` share one rule, so neither completes work the other counts as
open.

- Check: Completion rule, "the rule for completing a run, shared by Complete run and MCP
  set_run_status so neither completes work the other counts as open".

A share-link save (`PUT /api/checklists/shared/:token`) is held to the same rule, counting the
ticks it sends, and fails with `409 run_incomplete` (with the open task count, never task ids),
because the page in a link holder's browser cannot be trusted to check it
(`findRunCompletionRefusal` in `functions/api/utils/run-completion.ts`).

- Check: Shared run API, "refuses to complete a run with open tasks and writes nothing", "refuses
  to complete a run whose ticked task still has an open Sub-task" and "completes a run when the
  same save ticks its last open task".

The API holds every write to the freeze (`functions/api/utils/completed-run-freeze.ts`), so a
client that skips the page's check cannot untick either: a `PUT /api/checklists/:id` or share-link
save that ticks or unticks a task or Sub-task of a completed Run, without setting its status back
to `in_progress`, fails with `409 run_completed`, and so do MCP `set_task_completed` and
`set_subtask_completed`. Task notes stay editable.

- Check: Freeze on D1, "refuses a save that would $change, and writes nothing" and "keeps task
  notes editable".

## Reopening

Reopening is that status change back to `in_progress` (`PUT /api/checklists/:id` or the share
link, or MCP `set_run_status`). It checks the revision like any save and records an audit event,
and the same save may then change tasks.

- Check: Freeze on D1, "reopens through PUT at the current revision, records it, and then takes
  task changes", "refuses a reopen sent at an older revision with edit_conflict" and "reopens over
  MCP with set_run_status, after which set_task_completed works again".

Reopening counts toward the active-run limit inside the write.

- Check: Reopen limit, "refuses PUT status in_progress on a completed run at the limit" and
  "refuses a share-link reopen at the owner's limit".

The web app has no Reopen action yet.

- No automated check yet.

## Who completed a Run

A Run records who completed it and when (`completed_by_user_id`, `completed_at`) only when it
becomes completed. Later saves of a completed Run (a rename, a tick, a note), by anyone, keep the
original completer and time, and a client-sent `completed_at` is used only on that transition.

- Check: Completion stamps, "stamps the completer and time when the run becomes completed", "keeps
  the original completer and time when another member renames a completed run", "ignores a
  different completed_at sent for a run that is already completed" and "keeps the completion time
  the client sends when the run becomes completed".

Reopening from the run page, a share link, or MCP keeps both.

- Check: Completion stamps, "keeps the completion stamps when a completed run is reopened".

Revalidation clears them, since it reopens the Run.

- Check: Revalidate API, "explicitly revalidates a completed run against the current template".

A completion through a share link names the visitor only when they belong to the Run's owner
context, and otherwise no one, so a reopened Run never keeps its previous completer. The logic is
in `functions/api/utils/run-completion.ts`.

- Check: Shared run API, "names a signed-in owner who completes the run through its share link" and
  "restamps a reopened run on the next completion and does not keep the previous completer, naming
  nobody for an anonymous guest".
