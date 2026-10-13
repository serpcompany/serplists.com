# Forms on a Run

Filling in a task's Form on a Run, and exporting a Run's answers. A Template defines its Forms in
the [Template editor](template-editor.md#forms).

Abbreviations: **Forms spec** is `tests/e2e/template-forms.spec.ts`, **Form inputs** is
`tests/unit/components/ContentRendererFormInputs.dom.test.tsx`, **Form saves** is
`tests/unit/features/run-execution/runExecutionActions.forms.test.ts`, **Run sections** is
`tests/unit/lib/utils/checklistSections.forms.test.ts`, **Task panel forms** is
`tests/unit/components/run-execution/TaskExecutionPanel.forms.test.tsx`, **Shared run forms** is
`tests/unit/components/run-execution/SharedRunView.forms.test.tsx`, **Form guard** is
`tests/unit/functions/api/run-form-guard-d1.test.ts`, **Export button** is
`tests/unit/views/ChecklistRunPage.answersExport.test.tsx`, **Export menu** is
`tests/unit/components/run-execution/RunAnswersExportMenu.dom.test.tsx`, **Answers export** is
`tests/unit/features/run-execution/runAnswersExport.test.ts`, and **Guest run page** is
`tests/unit/views/GuestRun.dom.test.tsx`.

## Filling in a Form

A task's Form is filled in on the run page and on a [guest run](guest-runs.md), and the task
completes only once its Form is answered.

- Check: Forms spec, "a Template's form is filled in on its run, and the task completes only once
  the form is answered".

Typed answers save when the field loses focus, and choices, checkboxes and files when they change,
through the same save queue and revision check as notes.

- Check: Form inputs, "saves typed text when the field loses focus, not on every key, and says what
  a required field needs once it was left empty" and "saves a dropdown, multiple choice and
  checkbox answer as soon as it changes".

Each answer saves under its own key, so a double save is dropped but a changed answer is not, and
a save that lost a race is retried only when no one else changed that answer.

- Check: Form saves, "queues each answer under its own key, so a double save is dropped but a
  changed answer is not, and retries only when no one else changed it".

A required field left empty, or an answer that breaks its type's rule (a URL that is not http(s),
an email that does not look like one, a number outside its range, a date that does not exist, an
option that is no longer offered), blocks the task.

- Check: Form inputs, "checks a URL, an email, a number and a date by their kind, and saves a
  number as a number".

Mark Complete and the task checkbox stay available, but a click on a blocked task saves nothing
and says which field ("Finish this task's form first. `<label>`: `<message>`").

- Check: Form saves, "cannot be marked complete: the save is refused, names the first blocking
  field, and sends nothing".

The page then shows each blocking field's message and moves focus to the first one.

- Check: Form inputs, "shows every field that blocks the task and moves focus to the first one
  when completing was refused".

Ticking a task's last Sub-task does not tick the task while its Form blocks it.

- Check: Form saves, "is not ticked when its last Sub-task is, until the form is answered".

Fields do not count toward progress.

- Check: Run sections, "does not count fields toward progress".

A File field uploads with the Template uploader when signed in; a visitor who is not signed in
sees "Log in to upload", which comes back to the Run after.

- Check: Form inputs, "uploads a file for a signed-in user, shows its name, and removes it" and
  "asks a visitor who is not signed in to log in to upload, and comes back to the run after".

Answers on a completed Run are read-only, and so are they for a role that cannot change the Run.

- Check: Task panel forms, "offers no inputs on a completed run, whose answers are frozen, or to a
  role that cannot change the run".

The shared run page shows the answers read-only, and a task whose Form blocks it cannot be ticked
there ("This task can be ticked once its form is answered.").

- Check: Shared run forms, "shows the answers read-only, with no input to change them" and "keeps
  a task whose form blocks it from being ticked, and says why".

The API holds every save to the same rule, against the Form stored on the Run, so a client that
drops the Form or the required flag from what it sends cannot pass.

- Check: Form guard, "refuses an empty required field and an invalid answer, names them, and
  writes nothing" and "checks the stored field definitions, so dropping the form or the required
  flag from the payload does not pass".

A share-link save can tick a task only when its stored Form is answered, and ignores any answers
it sends.

- Check: Form guard, "refuses ticking a task whose stored form blocks it, even with answers sent
  along, and writes nothing" and "ignores answers a visitor sends with any other change".

An agent with a Run Key fills answers through MCP (`update_run` `set_form_answer`), held to the
same rules, except that it cannot upload a file and so can only clear a File answer
([Run Keys](run-keys.md#run-writes)).

- Check: Form guard, "answers the form, refuses an invalid answer, and then lets set_task_completed
  tick the task".

## Export answers

"Export answers" is in the run page's header when the Run has at least one Form field, also for a
view-only member, and never on the shared run link.

- Check: Export button, "is in the header of a run with a form", "is offered to a viewer of an
  Organization run too, who can read the answers but not change them", "is not offered on a run
  without a form" and "is not offered on the shared run link, which shows the answers read-only".

It downloads the answers the Run has saved as a file built in the browser: "Download CSV" or
"Download JSON".

- Check: Export menu, "offers a CSV and a JSON download for a run with a form".

The CSV has one row per field in run order, with the section, task, field, its type, whether it is
required, the answer as text and whether the task is done, and starts with a UTF-8 byte order mark
so spreadsheets read accents.

- Check: Answers export, "writes a header, then one row per form field in run order across
  sections, tasks and forms, with each kind's answer as text" and "starts with a UTF-8 byte order
  mark so spreadsheets read accents, and ends every record with CRLF".

The JSON has the Run's id, title, status, start and completion times, its Template and when it
was exported, then each field with its stored answer and the same answer text.

- Check: Answers export, "names the run, its Template and when it was exported, then lists each
  field with its raw answer and its text" and "keeps each answer as stored, null when unanswered,
  beside the same text the CSV holds".

Options show by label, a checkbox as "Checked", a file as its name and full link, and an
unanswered field as an empty answer.

- Check: Answers export, "leaves the answer empty for an unanswered field, blank text, no choices
  and an unticked checkbox" and "shows an option by its id when the option is gone, and a file by
  its name or its link alone".

A CSV cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so
a spreadsheet shows it as text instead of running it as a formula.

- Check: Answers export, "guards every column and a formula that needs quoting too, but leaves a
  plain signed number as it is".

The file is named after the Run title (`<run-title>-answers.csv` or `.json`, and `run-answers`
when the title has no letters or digits).

- Check: Export menu, "downloads the CSV, named after the run, with a byte order mark and each
  file's full link" and "downloads the JSON, named after the run, with the Template the page names".

A guest run exports the answers its browser holds the same way.

- Check: Guest run page, "exports the answers this browser holds as JSON named after the run, with
  the Template it runs".
