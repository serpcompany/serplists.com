# The run page

The run page, `/dashboard/runs/:id`: working through a Run's tasks, Sub-tasks and notes, and how
its saves behave. A task's Form is in [Forms on a Run](run-forms.md), completing a Run in
[Completing a Run](run-completion.md), and its share link in [Sharing a Run](run-sharing.md).

Abbreviations: **Run roles** is `tests/unit/views/ChecklistRunPage.roles.test.tsx`, **Task list**
is `tests/unit/components/run-execution/RunProgressSidebar.test.tsx`, **Run page** is
`tests/unit/views/ChecklistRunPage.test.tsx`, **Task panel** is
`tests/unit/components/run-execution/TaskExecutionPanel.test.tsx`, **Task reveal** is
`tests/unit/features/run-execution/taskReveal.test.ts`, **Task navigation spec** is
`tests/e2e/run-task-navigation.spec.ts`, **Save queue** is
`tests/unit/features/run-execution/saveQueue.test.ts`, **Run saver** is
`tests/unit/features/run-execution/runSaver.test.ts`, **Run saves spec** is
`tests/e2e/run-saves.spec.ts`, **Double clicks spec** is `tests/e2e/run-double-clicks.spec.ts`,
**Run action saves** is `tests/unit/features/run-execution/runExecutionActions.saves.test.ts`,
**View all spec** is `tests/e2e/activity-view-all.spec.ts`, **Progress** is
`tests/unit/lib/progress.test.ts`, **Run actions** is
`tests/unit/features/run-execution/runExecutionActions.test.ts`, **Sub-task parity** is
`tests/unit/lib/subTaskRuleParity.test.ts`, **MCP run reads** is
`tests/unit/functions/api/agent-mcp-handler.get-run.test.ts`, and **Notes spec** is
`tests/e2e/run-notes.spec.ts`.

## Who can change a Run

An Organization's Run follows the viewer's Organization Role: a runner can work through, rename
and share it, and a viewer sees it read-only, as does anyone the page does not yet know to be a
member.

- Check: Run roles, "lets a runner execute, rename and share the Organization run", "renders an
  Organization run read-only for a viewer" and "treats a run of an Organization the user is not
  (yet) known to belong to as read-only".

## Tasks

The page lists every task and opens any of them directly: in a side column on wide screens, and
from a Tasks button in the progress block on phones and narrower windows.

- Check: Task list, "lists every task at any width, marking the current and finished ones" and
  "offers a Tasks button that opens the task list below the desktop breakpoint".

Task counts ("2 of 5 tasks finished", the task list, "Task N of M", the runs list) count tasks
only, never Sub-tasks. The progress percentage and its bars follow the
[progress rule](#progress-and-sub-tasks), the same value the API stores as the Run's progress.

- Check: Run page, "ChecklistRunPage task counts, which count tasks as the task list, the Task N
  of M badge and the runs list do, never Sub-tasks" and "fills the header bar, the task list bar
  and the progress block's Progress with the same overall progress".

The task's Previous, Mark Complete and Next buttons stay at the bottom of the window until the end
of the task, so they are in view on a short task and do not move when the Run's Activity grows
after a save.

- Check: Task panel, "TaskExecutionPanel keeps its footer pinned to the bottom of the window".

Moving to another task (Mark Complete, Next, Previous, or a task list) scrolls back to that
task's title when it is out of view, just below the sticky headers.

- Check: Task reveal, "scrolls the next task to its title when Mark Complete moved on from the
  bottom of a long task", "scrolls when the header is hidden under the sticky site header" and
  "does not move the page when the new task title is already in view, but still focuses it".

Mark Complete, Next, Previous and the side task list also move focus to the title; the phone
Tasks sheet returns focus to its Tasks button, as dialogs do.

- Check: Task navigation spec, "the desktop task list opens a task at its title".

The rest of a double click that lands after that scroll is ignored.

- Check: Task panel, "TaskExecutionPanel ignores the second click of a double click, which would
  land on the next task its buttons now show".

Opening a Run, or saving a change to the task on screen, never moves the page or takes focus, and
a field the user is typing in keeps its focus.

- Check: Task reveal, "does nothing when the run first opens", "does nothing when the same task
  re-renders (notes, a sub-task, a refetch)" and "leaves the page and focus alone while the user is
  typing in a field".

## Saving

The page saves one change at a time, in order.

- Check: Save queue, "runs different saves one at a time, in order" and "ignores a key that is
  already pending, like a double click".

Each tick or untick sets the value the user clicked rather than flipping the saved one, so a click
made while an earlier save is still in flight never reverses it.

- Check: Task panel, "TaskExecutionPanel sends the value the user clicked".

A click that changes nothing sends no save.

- Check: Run saver, "writes nothing when the task already has the chosen value" and "sends nothing
  when a sub-task already has the chosen value".

Completing a task moves on to the next unfinished task only if the completed task is still open
when its save lands; a task the user opened while the save was in flight stays open.

- Check: Run saves spec, "a task opened while Mark Complete is saving stays open when the save
  lands" and "queued Mark Complete saves never move back to an earlier task".

Controls that change what they do after a click (Next Task becomes the next task's Mark Complete,
a completed task moves on to the next one, Rename becomes Save title) ignore the second click of a
double click.

- Check: Double clicks spec, "a double click on Next Task moves on without completing the next
  task" and "the second click of a double click after a fast save does not complete the next task".

Saving an unchanged Run title sends nothing.

- Check: Run action saves, "does not send a PUT, which bumps the revision and writes an audit
  event, for an unchanged title, even with surrounding spaces".

The Run's Activity shows each save without a reload.

- Check: Run saves spec, "the run's Activity shows a save without a reload".

It shows the latest 8 entries, and "View all activity" loads the latest 100.

- Check: View all spec, "a run's Activity shows its latest 8 entries, and View all activity shows
  the rest".

## Progress and Sub-tasks

Runs store progress independently from Templates. Progress counts every task and Sub-task as one
unit and is a whole percentage: 100% only when every unit is done, 0% only when none is, and
anything in between rounds to 1-99% (so 199 of 200 is 99%, not 100%). The app and the API compute
it with the same function (`src/lib/progress.ts`).

- Check: Progress, "is 100 only when everything is done and 0 only when nothing is", "is 99 in
  every calculator when one of 200 units is left" and "agrees between the client and the server".

A task with Sub-tasks is done when every Sub-task in all of its Sub-tasks blocks is ticked, and
unticking any of them reopens the task. Mark Complete ticks or unticks all of them.

- Check: Run actions, "stays open until every sub-task in every block is ticked", "clears a task
  completed with Mark Complete when a sub-task in another block is unticked" and "toggling an item
  updates its sub-items and persists private runs".

Mark Complete and a Sub-task tick queued together never leave a Sub-task unticked.

- Check: Run saves spec, "ticking the last sub-task, then Mark Complete during the save, keeps
  every sub-task ticked" and "Mark Complete, then ticking a sub-task that still looks unticked,
  keeps it ticked".

The web app and the agent API use the same rule and read the same Sub-tasks (`getTaskSubTasks` in
`src/lib/schemas/storedSections.ts`): only the rows of Sub-tasks blocks. Sub-items stored on
another block or on the task itself (older rows, hand-written packs, direct API writes) are never
shown, counted, ticked or matched by reconciliation, and imports and new Runs drop the ones on
other blocks.

- Check: Sub-task parity, "lets an agent finish a task by ticking its last visible Sub-task",
  "does not let an agent tick a sub-item the run page never shows", "never retires a sub-item the
  run page never showed" and "are the only sub-items stored content keeps on a block".

Run Key `get_run` and `update_run` results leave such sub-items out, live and retired work alike;
the stored Run keeps the ones on the task.

- Check: MCP run reads, "leaves them out of get_run, live and retired" and "leaves them out of the
  task update_run returns, but keeps the stored ones on the task".

## Notes

Task notes belong to the Run. Unsaved notes stay with their task while the user moves between
tasks, and are saved with Mark Complete and when the Run is completed.

- Check: Notes spec, "unsaved task notes are saved with Mark Complete and survive moving between
  tasks" and "completing a run saves an unsaved note and leaves without asking".

Mark Complete saves the notes in the same save, also when another session or a Sub-task already
completed the task.

- Check: Run action saves, "Mark Complete saves the draft notes of that task in the same PUT" and
  "Mark Complete saves the draft notes of a task that a teammate or a queued Sub-task save already
  completed".

Notes are never replaced by a save that returns while the user is still typing.

- Check: Notes spec, "text typed while a notes save is in flight is kept".

Leaving the page with unsaved notes asks for confirmation, through the app shell, Back or Sign
out, and on a share link too.

- Check: Notes spec, "asks before unsaved task notes are lost through the app shell, Back or Sign
  out" and "a share-link guest is asked before unsaved task notes are lost".

## When another session saved first

Run saves carry the revision they were made on, and a save made on an older revision gets
`409 edit_conflict` instead of overwriting newer work. When another session (an Organization
member, a shared link, a second tab, or an MCP agent) saved the Run first, the page (private and
shared) loads the latest Run, shows it, and retries the change once on it, so later saves never
keep failing on an old revision.

- Check: Run saver, "reloads on an edit conflict, retries once on the latest run, and keeps both
  changes", "retries only once, even when another session saves again between the reload and the
  retry, and then reports the conflict with the latest run shown" and "recovers the same way on a
  shared run link".

A tick or untick is retried as the value the user chose, so a tick made elsewhere is never undone.

- Check: Run saves spec, "a tick saved by another session is kept and this page can still save"
  and "ticking a task another session already ticked does not untick it".

Notes, a title, or completion are not retried when someone else changed the notes being saved or
the title; the page then shows the latest Run, keeps the unsaved notes, and asks the user to check
and try again.

- Check: Run saver, "does not overwrite task notes another session changed" and "retries a notes
  save when the other session changed a different task".
