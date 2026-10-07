# Run Execution

The run page shows one Run and lets people work through it: tick tasks and Sub-tasks, write
task notes, rename the Run, share it and complete it. A private Run opens at
`/dashboard/runs/<id>/`, a shared one at `/share/<token>/` for anyone with the link, and a
[guest run](#guest-runs), kept in a signed-out visitor's browser, at
`/profile/<user>/<template>/run/`. What
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
| `runExecutionActions.ts` | Each save (tick, Sub-task tick, notes, form answer, title, completion) and the queue entries the page binds |
| `runFormAnswers.ts` | A task's form: a field and its answer by id, whether the form blocks the task, and the refusal that names the first blocking field |
| `runAnswersExport.ts` | The CSV and JSON of a Run's form answers and their file name ([exporting answers](#exporting-answers)) |
| `runPersistence.ts`, `runSharing.ts` | Writing a Run privately or through a share link, Share and Stop sharing |
| `noteDrafts.ts`, `keptNoteDrafts.ts` | Unsaved task notes, and the notes kept when the session ends |
| `primaryTaskAction.ts`, `taskReveal.ts` | The task panel's main button, and bringing a newly shown task into view |
| `runHistory.ts`, `retiredRunItems.ts`, `useRunShareLink.ts`, `runTitle.ts`, `taskCheckboxLabel.ts` | The Activity preview, work removed from the Template, the share link dialog, renames, and the task checkbox's accessible name |
| `useRunPageActions.ts` | The run pages' handlers for ticks, notes, form answers and completion, with their toasts, the completion dialog's state and the task whose completion its form refused (`formAttempt`) |

The page is `src/views/ChecklistRun.tsx`, and a shared Run's layout is
`src/components/run-execution/SharedRunView.tsx`. The task panel, the task list and the phone
progress block are `RunWorkspace`, which the [guest run](#guest-runs) page shares.

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
block and row for a Sub-task), `notes:<task>:<text>`, `answer:<task>:<field>:<answer as JSON>`,
`title:<title>`, `complete`, `share` and `stop-sharing`. A save whose key is already queued or running is dropped and answers `ignored`:
it is the second click of a double click, and repeating it would send a second save, or a second
completion that conflicts with the first. A different value, such as an untick after a tick, is
queued as usual.

### Set, not flip

A tick carries the value the user clicked, never "the opposite of what is saved". A save queued
behind another, or retried on a reloaded Run, therefore never inverts the user's choice or undoes
the same change made elsewhere, and a tick that changes nothing sends no request
(`itemHasCompletion`). Mark Complete ticks every Sub-task of the task too, and a Sub-task tick
recomputes its task from every Sub-tasks block, not only the clicked one
(`areItemSubItemsCompleted`), and leaves the task open while its form blocks it. A Sub-task
save records the Sub-task's id when it is bound, and
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

## Form answers

A task's Form block holds fields the Template defines; the run keeps each answer on its field
(`answer`), found by field id. What blocks a task is the one rule in
`src/lib/schemas/formValidation.ts` (`findFormFieldProblems`), which the API shares.

- `ContentRenderer` renders a form's inputs only when the page passes `onFormAnswerChange`: the
  run page and the guest run, while the Run is open and the role can change it. Otherwise
  (template pages, a completed Run, a view-only role, the shared run page) it lists the fields
  and answers read-only (`FormFieldList`).
- Each input keeps what the user typed until its save lands, so the field never jumps back.
  Typed answers (short and long text, URL, email, number, date) save when the field loses focus;
  a dropdown, a multiple choice, a checkbox and a file save when they change. An answer equal to
  the saved one sends nothing, unless a save of another answer to the field is still on its way
  or failed. An empty answer is saved as no answer, and a number that is not a number is not
  saved.
- `saveRunFormAnswer` is queued like any save (`answer:<task>:<field>:<answer>`), so it builds on
  the latest Run and sends its revision. Its retry after `409 edit_conflict` runs only when the
  reload left that field's answer as it was. It refuses a completed Run (answers freeze, as ticks
  do) and a share link (`shared_disabled`: answers there are read-only), and a field the task no
  longer has answers `not_found`.
- A field's message (`formFieldProblemMessage`) shows once the field was left or changed, and
  is computed from what the input shows, not only from what is saved.
- Mark Complete and the task checkbox stay available. `toggleRunItem` refuses to complete a task
  whose form blocks it before it sends anything (also a task stored as ticked), with
  `{ kind: 'error', code: 'form_incomplete' }` and a message naming the first blocking field
  ("Finish this task's form first. <label>: <message>"). The API refuses the same save with
  `409 form_incomplete`, which the page treats the same way; the answers saved before it stay.
  `useRunPageActions` toasts the message and counts the refusal on that task (`formAttempt`);
  the task panel then shows every field's message, and the first form with a problem moves
  focus to its first one and scrolls it to the middle of the window. A count on mount (the
  task opened again later) moves nothing.
- A form gates ticking its task, not completing the Run: `isRunItemFinished` and the API's
  `findOpenRunTasks` both count a ticked task as finished whatever its form holds
  (`tests/unit/functions/api/run-completion-rule.test.ts`). Every save path refuses to tick a
  blocked task, and reconciling a Run reopens a done task whose form a Template change now
  blocks, so a ticked task with a blocking form is rare. Fields don't count toward progress.

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
  editable. The API refuses the same saves with `409 run_completed` and the same message
  (`functions/api/utils/completed-run-freeze.ts`): it compares each task's and Sub-task's
  completion with the stored Run, matched the way this page maps them (an id, or the position the
  page numbers an entry without one), so the page's own saves of an old Run's shapes, such as a
  note on a task stored as text, never count as a change.
- After completing, a signed-in user goes to My Runs only while still on the page
  (`usePageVisit`). The leave guard lets them go, since completion saved every draft; a note typed
  while completion was saving still asks. A guest on a share link stays, and the page shows the
  Run completed.

## Forms

A task's form ([form blocks](template-content-types.md#form-blocks)) gates that task and
nothing else. `findFormFieldProblems` (`src/lib/schemas/formValidation.ts`) is the one rule, and
every route that ticks a task applies it:

- **`PUT /api/checklists/<id>`** checks each task saved as done whose completion or answers
  changed, with the stored Run's field definitions and the submitted answers matched by field id
  (`functions/api/utils/run-form-guard.ts`). The client's copy of the definitions is never trusted,
  so a payload that drops the form or its `required` flag still fails. A task already done with the
  answers it was done with is not checked again. The refusal is `409 form_incomplete` with
  `FORM_INCOMPLETE_MESSAGE` and `details: { fieldCount, fields: [{ taskId, fieldId, reason }] }`,
  the first 50 fields, and nothing is written.
- **The shared link** keeps answers read-only: `mergeSharedRunState` copies only completion and
  notes, so answers a visitor sends are ignored, and ticking a task whose stored form blocks it is
  refused the same way.
- **MCP** `set_task_completed` with `completed: true` fails with the tool error `form_incomplete`
  and the same `details`, and `set_subtask_completed` completes its task only when the form is
  complete ([agent access](agent-access.md)).
- **MCP fills answers** with `update_run` `set_form_answer`, one field at a time, on the stored
  Run's field definitions: an answer of the wrong type for its kind, or a non-empty one the rule
  calls invalid, fails with `invalid_answer` and the field's `formFieldProblemMessage`, as the
  run page shows it. `null` or an empty answer clears the field, even a required one, and
  answering never ticks or unticks the task; on a ticked task, an answer that leaves its form
  blocking fails with `form_incomplete`, as `PUT /api/checklists/<id>` refuses it. A File field
  can only be cleared (`unsupported_field_kind`), because an agent has no upload.
- **A completed Run's answers are frozen** like its ticks (`completed-run-freeze.ts`): a save that
  changes one fails with `409 run_completed` unless it reopens the Run, and MCP `set_form_answer`
  fails with `run_completed`. Notes stay editable.
- **Template changes** carry answers by field id while the kind is unchanged. A field whose kind
  changed starts empty. The answers of removed and kind-changed fields join the retired work as
  `formAnswer` entries, which "Removed from Template" shows as "label: answer" under their task's
  name, and an answer comes back if its field does. A done task whose form now blocks it, after a
  new required field say, reopens, as a task does when a Sub-task is added.
- Fields never count toward progress, and a form never blocks Finish Run: `findOpenRunTasks` and
  the page's `canFinishRun` look only at tasks and Sub-tasks (`run-completion-rule.test.ts`).

## Exporting answers

"Export answers" (`RunAnswersExportMenu`) sits in the header of the run page and the guest run
whenever the Run has a form field, for a view-only role too, and never on the shared run link. It
builds the file in the browser from the Run the page holds, with no request
(`src/features/run-execution/runAnswersExport.ts`), and downloads it with `downloadFile`
(`src/lib/utils/downloadFile.ts`, which the template pack export uses too). A typed answer is in
the file once its save landed: leaving the field to open the menu starts that save.

- **What it holds:** one entry per form field in run order (section, task, field). The answer
  text is `formatFormAnswer`'s (option labels, "Checked", a number as written), except a file,
  which reads "<file name> (<full link>)", the link resolved against the page's origin. An
  unanswered field has an empty text and a `null` answer.
- **CSV:** columns Section, Task, Field, Type (the editor's type names, `FORM_FIELD_KIND_LABELS`),
  Required, Answer and Task done; RFC 4180 quoting (a cell with a comma, a quote, a CR or an LF
  is quoted, with its quotes doubled), CRLF after every record, and a UTF-8 byte order mark so
  Excel reads accents.
- **Formula injection:** answers and titles are user text, and a spreadsheet may run a cell that
  starts with `=`, `+`, `-`, `@`, a tab or a CR as a formula. Every such cell, in any column,
  gets a leading `'`, which spreadsheets show as text (OWASP's CSV injection advice). A negative
  number gets one too; the JSON keeps the raw answer.
- **JSON:** `run` (`id`, `title`, `status`, `startedAt`, `completedAt` or `null`, and `template`
  `{ id, title }` when known: the page's Template on a guest run, the Run's recorded source
  otherwise), `exportedAt`, and `answers`, each `{ section, task, field, answer, answerText }`
  with the stored answer as it is.
- **File name:** the run title through `generateSlug`, then `-answers.csv` or `-answers.json`;
  `run-answers` when the slug is empty.

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

## Guest runs

A visitor who is not signed in runs a Public Template at `/profile/<user>/<template>/run/`
(`src/views/GuestRun.tsx`; what users see is in
[features](../product-specs/features.md#runs-and-sharing)). The run lives only in the browser,
and the page reuses this model rather than a copy of it:

- `src/features/guest-runs/guestRunStore.ts` is the storage boundary: one entry per Template in
  `localStorage` (`serplists:guest-run:<templateId>`, through `safeLocalStorage`, so a browser
  that blocks site data keeps the run for the page's life), parsed with a Zod schema whose
  sections go through `normalizeSections`, the mapper the API's runs use. A value it cannot read
  counts as no run. Starting copies the Template's sections with every task and Sub-task
  unticked (`resetSectionsCompletion`) and the dialog's name (`resolveRunName`); while a run is in
  progress, starting returns it, which is the one-active-run rule.
- `useGuestRunModel` passes `useRunExecutionModel` a `guest` source in place of the API: its
  `load` reads the stored run, and its `updateRun` is `saveGuestRun`, so ticks, Sub-task ticks,
  notes, completion, the save queue and the frozen completed run follow the same code as any Run.
  The mode is `guest`: no Activity is loaded, and nothing is shared.
- Each stored run carries a revision. `saveGuestRun` refuses a save made on another revision, or
  on a run that was deleted or replaced since, with the `409 edit_conflict` an API save gets, so
  the saver reloads the stored run and retries on it ([when another session saved
  first](#when-another-session-saved-first)): a second tab never overwrites the first one's
  ticks. A reload that finds another run (`load` compares the id it opened) marks the run not
  found, and the page goes back to the template page.
- Pages in this tab learn of a change through `subscribeToGuestRuns` (`useGuestRunStatus`, a
  `useSyncExternalStore` reader with a server snapshot of `null`), which the template page uses
  to offer "Continue Run". Other tabs are not followed live: only the theme and the session
  listen for `storage` events, and the revision check covers a stale tab's next save.
- The page waits for the session check: a signed-out visitor with no stored run gets one started
  with the default name (so a plain link opens a run), and a signed-in user is sent to the
  template page. Once the run has opened, the page never starts another, so Delete run (which
  removes the entry and leaves for the template page) cannot be followed by a fresh start.
- Save to account (`useSaveGuestRunToAccount`, on the guest run page and the public template
  page) goes through the API as any Run does: `startTemplateRun` with the Templates context's
  `createRun` (the active context, its plan gates and their messages), then the created Run is
  loaded by id (`loadRunExecutionData`), so the progress lands on the content the server copied,
  and `carryGuestRunProgress` (`guestRunProgress.ts`) copies ticks and notes onto it by task id,
  each Sub-task by id or, without one, by block and row (`findRunSubItem`), and each form answer
  by field id while the field's type is unchanged, before one `updateRun` saves it with the
  loaded revision. A task with Sub-tasks is done exactly when all of them are, a task whose form
  now blocks it is not carried as done, and the Run is completed only when the guest run was and
  every task carried over done. A guest's File field shows "Log in to upload", a link to Log in
  that comes back to the run. The browser's copy is removed only after that save. A plan gate keeps it: `upgrade_required`
  starts Personal checkout (the button stays busy through `useRedirectPending`) or shows the
  Organization's paid-plan message, as Start Run does. If the save of the progress fails after the
  Run was created, the guest run stays and the new Run keeps no progress.
