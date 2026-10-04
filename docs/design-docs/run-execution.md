# Run Execution

The run page shows one Run and lets people work through it: tick tasks and Sub-tasks, write
task notes, rename the Run, share it and complete it. A private Run opens at
`/dashboard/runs/<id>/`, and a shared one at `/share/<token>/` for anyone with the link. What
users see is in [features](../product-specs/features.md#runs-and-sharing). How the API stores,
reconciles and completes a Run, and what a share-link save may change, is in
[data persistence](data-persistence.md#stable-ids-and-run-reconciliation) and
[shared-run links](data-persistence.md#shared-run-links). The guard that asks before unsaved notes
are lost is in [unsaved changes](../FRONTEND.md#unsaved-changes). This page is how the page's
model in `src/features/run-execution/` works, and why.

## Where it lives

| Module (`src/features/run-execution/`) | Holds |
| --- | --- |
| `useRunExecutionModel.ts` | The page's state (the Run, the selected task, unsaved notes, the Activity) and the actions the page calls |
| `runExecutionLoad.ts`, `runExecutionMappers.ts` | Loading a Run, mapping the API's rows, when a task is finished, and which task to select |
| `saveQueue.ts`, `runSaver.ts` | Saves one at a time, double clicks, and recovery when another session saved first |
| `runExecutionActions.ts` | Each save (tick, Sub-task tick, notes, title, completion) and the queue entries the page binds |
| `runPersistence.ts`, `runSharing.ts` | Writing a Run privately or through a share link, Share and Stop sharing |
| `noteDrafts.ts`, `keptNoteDrafts.ts` | Unsaved task notes, and the notes kept when the session ends |
| `primaryTaskAction.ts`, `taskReveal.ts` | The task panel's main button, and bringing a newly shown task into view |
| `runHistory.ts`, `retiredRunItems.ts`, `useRunShareLink.ts`, `runTitle.ts`, `taskCheckboxLabel.ts` | The Activity preview, work removed from the Template, the share link dialog, renames, and the task checkbox's accessible name |

The page is `src/views/ChecklistRun.tsx`, and a shared Run's layout is
`src/components/run-execution/SharedRunView.tsx`.

## Loading a Run

The page loads its own Run: a private one by id (`GET /api/checklists/<id>`), a shared one by
token (`GET /api/checklists/shared/<token>`). It never starts from the runs list, which loads only
on the runs dashboard and is not refreshed after this page saves. A `404` means the Run is gone,
or the link no longer works, and the page leaves with "Run not found" without asking about unsaved
notes, which can no longer be saved (also when the Run was deleted during a save); any other
failure is a load error the page reports, never "not found".

The model loads again only when the run id or share token changes
([FRONTEND.md](../FRONTEND.md#data-and-state)), since a load clears the unsaved notes and the
selection. The model reads the page's `updateRun` (the Templates context's) through a ref when a
save calls it, rather than depending on it, so a new callback never reloads the Run. The Run opens
on its first unfinished task, or on its first task when every task is finished.

`mapChecklistToRun` reads the API's row into a `ChecklistRun`:

- A Run from before sections stores a flat task list, which becomes one section, "Checklist".
- It keeps the Run's Organization (`team_id`), whose role decides what a member may do on a
  private Run (a share link decides for a shared one), and its `revision`, which every save sends.
- Work the Template no longer holds (`retired_items`) is parsed apart (`parseRetiredRunItems`) and
  kept out of `sections`, so progress, completion and the task selection never count it. A
  malformed entry is dropped, and an id retired more than once keeps its latest entry.

For the runs list, `mapChecklistRuns` lists a Run whose content cannot be read with no tasks, so
one bad row never empties the list and the Run can still be deleted.

## Saving

A tick, a note, a rename or completion saves the whole Run: its sections, status, progress,
completion time and `expected_revision`. Two saves sent at once would therefore conflict with each
other.

### One save at a time

`createSaveQueue` runs saves one at a time, in order. A save is bound to the latest Run only when
its turn comes (`QueuedRunSave.bind`), not to the Run on screen when the user clicked, so it builds
on the result of the save before it and sends that save's revision. The model keeps that latest
Run in a ref, updated as soon as a save returns, and reads unsaved notes the same way, so a queued
save sends the notes as they are when it runs.

Because a save sees the latest Run, the rules that depend on the Run are checked inside the save,
not at the click:

- a tick queued behind completion is refused once completion has landed, since a completed Run is
  frozen;
- completion queued behind an untick finds an open task and is refused;
- completing a Run that is already completed sends nothing, since another save would bump its
  revision and write another audit event;
- a rename is compared with the latest title, and one that changes nothing (`isRunTitleChange`: an
  empty title, or the saved one with spaces around it) sends nothing, for the same reason. The
  page itself closes an untouched title field without a save or a toast.

### Double clicks

Each queued save has a key naming what the user asked for: `toggle:<task>:<value>` (with the
block and row for a Sub-task), `notes:<task>:<text>`, `title:<title>`, `complete`, `share` and
`stop-sharing`. A save whose key is already queued or running is dropped and answers `ignored`:
it is the second click of a double click, and repeating it would send a second save, or a second
completion that conflicts with the first. A different value, such as an untick after a tick, is
queued as usual.

### Set, not flip

A tick carries the value the user clicked, never "the opposite of what is saved". A save queued
behind another, or retried on a reloaded Run, therefore never inverts the user's choice or undoes
the same change made elsewhere, and a tick that changes nothing sends no request
(`itemHasCompletion`). Mark Complete ticks every Sub-task of the task too, and a Sub-task tick
recomputes its task from every Sub-tasks block, not only the clicked one
(`areItemSubItemsCompleted`). A Sub-task save records the Sub-task's id when it is bound, and
`findRunSubItem` finds it by block and row, or by that id when a reloaded Run moved it to another
row.

### Writing the Run

`persistRun` computes progress with the API's own function before every write. A private Run goes
through the Templates context's `updateRun` (`PUT /api/checklists/<id>`, with the body
`buildRunUpdatePayload` builds in `src/contexts/runUpdatePayload.ts`, which sends the title only
for a rename). A shared Run goes to `PUT /api/checklists/shared/<token>`, whose handler takes
only completion, notes and the Run's status from it. Both answer with the new revision, which the
page's Run takes.

Share and Stop sharing (`runSharing.ts`) leave the Run's revision as it was, so the page marks its
Run public or private and keeps saving on it. They go through the queue like any other save. Share
tells the cached runs lists at once (`markRunShared`, in
[client data](client-data.md#refreshing-after-a-write)), and Stop sharing refreshes them. The link
dialog and when a link is reused are in [shared-run links](data-persistence.md#shared-run-links).

### When another session saved first

Another member, a guest on a share link, a second tab or an agent can save the Run between this
page's load and its save. The API then answers `409 edit_conflict`, and `createRunSaver` recovers:

1. It loads the Run again from the API, never from a cache, and shows it, so the saves queued
   behind this one build on it.
2. It retries the save once on the reloaded Run, unless the save's `canRetryOn` says the reload
   changed what the save would overwrite: the saved notes of a task whose draft it carries (a notes
   save, Mark Complete, or completion), or the title (a rename). The page then shows
   `RUN_CHANGED_ELSEWHERE_MESSAGE` and keeps the drafts, so the user checks and tries again.
3. A second conflict on the retry ends the same way, with the latest Run shown: the page never
   keeps retrying.

A reload that finds the Run gone marks it not found, and a reload that fails reports the first
error.

### After the saves settle

Every save writes an audit event, so the Run's Activity is refreshed once the queue is idle after
a save that succeeded (`onSaved`), not once per click
([client data](client-data.md#refreshing-after-a-write)). The Activity preview
(`buildRunHistoryQuery`) asks for `HISTORY_DISPLAY_LIMIT` events under the Run's Activity key (and
`HISTORY_FULL_LIMIT`, 100, after "View all activity"), with
the limit in the key so a longer history never reuses the preview's entry. A shared Run never loads
its history.

## Task notes

- A draft exists only while it differs from the task's saved notes (`updateNoteDraft`): typing the
  saved text back removes it. Drafts stay with their task while the user moves between tasks, and a
  save that lands while the user is still typing keeps every draft that still differs from what the
  Run now holds (`pruneNoteDrafts`). A draft whose task left the Run is dropped.
- Mark Complete carries the task's draft in its own save, also when the task was already completed
  elsewhere or by a queued Sub-task save, since the page moves on after it. Completing the Run
  carries every draft, since the page leaves.
- Unsaved drafts make leaving ask (`RUN_NOTES_UNSAVED_MESSAGE`). When the session ends in the
  background, `useKeptRunNoteDrafts` keeps them in `sessionStorage`, which survives the redirect to
  sign-in and ends with the tab, keyed by user and Run, each with the saved notes it was typed over.
  When the same user opens that Run again, the drafts are read once and removed, and only those
  whose task's saved notes did not change come back: restoring the others would overwrite someone
  else's text. A shared Run's page is public and stays open, with its notes, after a sign-out, so
  nothing is kept for it.

## Completing a Run

- A task is finished when it is ticked and so is every Sub-task in all of its Sub-tasks blocks
  (`isRunItemFinished`), the rule the API applies. A ticked task with an open Sub-task (older Runs,
  API writes) is where the Run opens and where moving on leads.
- A tick that leaves every task finished answers `shouldPromptComplete`, which opens the completion
  dialog. The server never completes a Run on its own, so `canFinishRun` keeps the page's Complete
  run action while every task is finished and the Run is in progress: a dismissed dialog, a reload
  or ticks made over MCP never leave it stuck.
- Completion sends the status `completed`, progress 100, the completion time and every draft. A
  completed Run is frozen (`COMPLETED_RUN_FROZEN_MESSAGE`): unticking would leave a Run labelled
  Completed with open tasks, and ticking again would never offer completion again. Notes stay
  editable.
- After completing, a signed-in user goes to My Runs only while still on the page
  (`usePageVisit`). The leave guard lets them go, since completion saved every draft; a note typed
  while completion was saving still asks. A guest on a share link stays, and the page shows the
  Run completed.

## Moving between tasks

- When a tick's save lands, `getSelectionAfterToggle` moves on from the completed task to the next
  unfinished one after it, wrapping to earlier ones, and stays when every task is finished, so the
  completion dialog shows over it. It decides from the selection at that moment (a state updater),
  not the one captured at the click, so a task the user opened while the save was in flight stays
  open.
- The task panel's main button (`getPrimaryTaskAction`) either calls a handler or renders disabled,
  so it never looks clickable and does nothing. On a completed Run, and for a member whose role
  cannot update the Run, it only moves between tasks. On a finished task with no next one, while
  the Run cannot be finished, it leads to the unfinished task ("Next unfinished task"), and only a
  completed Run reads "Run completed".
- The private page's shell clips its overflow (`overflow-clip`), never `hidden` or `auto`: a scroll
  container there would hold the task footer's sticky position to itself instead of the window.
- The task panel stays mounted while its task changes, and the window scrolls, with Previous, Mark
  Complete and Next below the task's content: without help the next task would open where the last
  one was scrolled to, past its title. `createTaskRevealer`, run by `TaskHeaderReveal` before the
  browser paints, does nothing for the first task shown (opening a Run keeps the browser's scroll
  and never takes focus) or for a render of the same task. When the task changes, unless the user
  is typing in a field (`isTypingTarget`), it scrolls the task's header to just below the sticky
  headers if it is out of view, with a pixel of slack for subpixel layout, then focuses the title.
  After a scroll it ignores repeat clicks briefly (`ignoreRepeatClicksBriefly` in
  `src/lib/utils/repeatClick.ts`): the page moved under the pointer, so the rest of a double click
  on Mark Complete or Next must not land on what is there now.
