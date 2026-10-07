# Forms

- **Status:** active
- **Last updated:** 2026-10-06
- **Goal:** A task can hold a Form block whose fields the Template defines and every Run fills
  in, and a task whose form has a missing or invalid required answer cannot be marked done
  (issue #288).

## Owner decisions (2026-10-06)

- A form is a **block inside a task** (Add Block → Form), defined in the Template like
  Sub-tasks. There is no separate Forms library and no new table. Copying, sharing or
  importing a Template copies its forms.
- **Field kinds:** short text, long text, URL, email, number, date, dropdown (one choice),
  multiple choice, checkbox and file.
- **Required fields block the task**, not the Run. A task whose form is incomplete cannot be
  marked done in the web app, the API or MCP. Finish Run works as today.
- **Answers also appear:**
  - in an export of a Run's answers (CSV or JSON);
  - through MCP, which can read and fill them;
  - read-only on the shared run link;
  - as an empty form on the public Template page.
- **File fields work like Template files.** People signed in on the Run upload with the
  existing uploader into the `template-files` bucket, and anyone with a file's link can open
  it. Guests and signed-out shared-link visitors see "Log in to upload".

## Design

### Stored shape

A form block lives in a task's `contents` in `templates.items` and in each run's
`checklist_runs.items`:

```ts
{ id, type: 'form', value: '', fields: FormField[] }

type FormField = {
  id: string;            // `field_<uuid>`, stable, unique across the Template
  label: string;         // non-blank
  kind: 'text' | 'longText' | 'url' | 'email' | 'number' | 'date'
      | 'select' | 'multiSelect' | 'checkbox' | 'file';
  required: boolean;
  description?: string;  // help text under the label
  options?: { id: string; label: string }[]; // select and multiSelect only, at least one
  min?: number;          // number only
  max?: number;          // number only
  answer?: FormAnswer;   // on a run's copy only
};
```

- **Answer by kind:**

  | Kind | Answer |
  | --- | --- |
  | `text`, `longText`, `url`, `email` | `string` |
  | `date` | `YYYY-MM-DD` string |
  | `number` | `number` |
  | `select` | an option id |
  | `multiSelect` | option ids |
  | `checkbox` | `boolean` |
  | `file` | `{ url, fileName, fileSize }` |

  - A missing answer, `''`, `[]` and `false` are empty.
  - Answers point at option ids, so renaming an option keeps them.
  - The key is `answer`, not `value`: `db/maintenance/find-malformed-checklist-content.sql`
    requires `value` to be text at every depth.
- **Bounds:**

  | Item | Limit |
  | --- | --- |
  | Fields per block | 50 |
  | Options per field | 50 |
  | Label | 200 characters |
  | Help text | 1,000 characters |
  | `text` answer | 500 characters |
  | `longText` answer | 10,000 characters |
  | `url` answer | 2,048 characters |
  | `email` answer | 254 characters |

  The run content limit (896 KiB) still caps the whole run.
- **Answers are run state, like `isCompleted` and `notes`:**
  - they are never meaningful in a Template;
  - starting a run, importing and copying clear them;
  - portable export leaves them out;
  - they don't count as structure (`RUN_STATE_KEYS`) or as an edit in audit compaction
    (`RUN_STATE_FIELDS`).
  - Field definitions are structure, so adding, removing or changing a field moves
    `content_version` and the runs follow it.
- **No D1 migration:** forms ride in the existing JSON columns. The maintenance SQL learns the
  `fields` and `options` arrays and the `label`, `kind`, `required` and `answer` keys.

### One validation rule

`findFormFieldProblems(task)` in `src/lib` lists each field that blocks the task, with
`{ fieldId, reason: 'required' | 'invalid' }`.

- **`required`:** a required field is empty.
- **`invalid`:** a non-empty answer breaks its kind's rule:
  - a URL must be http(s);
  - an email must look like an address;
  - a number must be finite and within `min`/`max`;
  - a date must be a real `YYYY-MM-DD` date;
  - an option must exist;
  - a file needs an upload URL;
  - text must fit its length.

The web app, the API and MCP share this function. A parity test keeps the client and server
completion rules in step (`subTaskRuleParity.test.ts`, `run-completion-rule.test.ts`).

### Enforcement

- **Run page:**
  - Mark Complete and the task checkbox stay available. A click on a task with a blocking
    form shows each field's message and doesn't save.
  - A task with Sub-tasks is no longer ticked automatically when its last Sub-task is done
    while its form blocks it (`toggleRunSubItem`).
- **`PUT /api/checklists/:id` (owner):**
  - A task saved as done is checked with the **stored** run's field definitions and the
    submitted answers by field id. The client's copy of the definitions is not trusted, so
    dropping the form from the payload doesn't pass.
  - Refused with `409 form_incomplete` and the blocking fields.
- **Shared PUT:** answers stay read-only. `mergeSharedRunState` ignores submitted answers, and
  ticking a task whose stored form blocks it is refused the same way.
- **MCP:** `set_task_completed` is refused with `form_incomplete`, and `set_subtask_completed`
  doesn't tick the task automatically. `update_run` `set_form_answer` fills answers, one field
  at a time.
- **Completed runs:**
  - Answers freeze, like ticks (`completed-run-freeze.ts`). Reopening the run makes them
    editable again.
  - Notes stay editable.
- **Template changes (`template-reconciliation.ts`):**
  - Answers carry over by field id while the kind is unchanged. A field whose kind changed
    starts empty, and its old answer is retired.
  - The answers of removed fields retire into `retired_items` (new kind `formAnswer`) and show
    under "Removed from Template".
  - After reconciling, a done task whose form now blocks it (a new required field) reopens,
    as a task does when a Sub-task is added.
- **Progress:** fields don't count toward the percentage. The task is the unit.

### Screens

- **Editor:**
  - Add Block → "Form".
  - The form editor lists fields. Each field has a label, a kind select, a Required switch and
    optional help text, plus an options list for dropdown and multiple choice, or min and max
    for numbers.
  - Fields can be added, removed and moved up or down, and the editor works at 390px.
  - Save drops blank fields, blank options and an empty form.
- **Public Template page, Template detail and the editor preview:** the form read-only, with
  each label, its kind, a "Required" mark and the options.
- **Run page and guest run:**
  - Inputs by kind, with help text and the field's message.
  - Answers save on change or blur through the run's save queue, with the revision check, as
    notes do.
  - File fields use the existing uploader; a guest sees "Log in to upload".
- **Shared run page:** answers read-only.

### Portable packs

- `schemaVersion` becomes `2.1.0`. Import accepts `2.0.0` and `2.1.0`, and export writes
  `2.1.0`.
- JSON, YAML and Markdown carry forms:
  - JSON and YAML as `fields` on a `form` block;
  - Markdown as a fenced `serplists:form` YAML block.
- Export never includes answers.
- The bundled pack tooling learns the block:
  - lint rules for an empty form, a blank label and a choice kind without options;
  - the preview and the README render it.
- The JSON Schema is regenerated.

## Progress

Two self-contained PRs (the owner asked on 2026-10-05 for no stacked PRs and no PR that
leaves the site broken until the next one lands):

- [x] **PR 1, the Form block** (#290, merged into `staging` on 2026-10-06): everything in Design above except the answers export and the
  MCP fill operation. MCP `get_run` shows fields and answers, and its guards apply.
  - [x] Foundation: the types, kinds and limits (`src/lib/schemas/formFields.ts`), the stored,
    legacy, portable and editor schemas, the sanitizers, `findFormFieldProblems` and its
    messages (`src/lib/schemas/formValidation.ts`), the editor's form and field factories,
    the run page's `normalizeSections` and `resetSectionsCompletion`, pack version `2.1.0`
    and the regenerated JSON Schema, and `contentTypeLists.test.ts`, which keeps every copy
    of the block type list in step.
  - [x] Field ids: assigned, matched and unique across the Template like Sub-task ids, on
    every save and read and in MCP template operations; options without an id get one.
  - [x] Template changes: answers carried by field id, removed and kind-changed answers
    retired as `formAnswer` and shown under "Removed from Template", done tasks a form now
    blocks reopened, answers cleared when a run starts.
  - [x] `PUT /api/checklists/:id` and the shared link refuse a blocked task with
    `409 form_incomplete`; the link keeps answers read-only; a completed run's answers are
    frozen.
  - [x] Answers are run state for the structure comparison and the run audit, which lists the
    tasks whose answers changed (`answersChanged`).
  - [x] MCP: `set_task_completed` refused and `set_subtask_completed` not auto-completing
    while a form blocks its task, `get_run` showing fields with answers, and the template
    tools' JSON Schema for form blocks.
  - [x] Packs: export without answers, import (new field ids, cleared answers), Markdown
    `serplists:form` blocks, the bundled pack lint, preview and README, the docs examples
    and the sample template; the maintenance SQL knows forms.
  - [x] Editor: Add Block → "Form"; `FormFieldsEditor` with a label, a type select, a Required
    switch, help text, options for Dropdown and Multiple choice, a minimum and maximum for
    Number; add, remove (never the last field) and move up or down; works at 390px. Save
    drops blank fields, blank options, a choice field with no option and an empty form
    (`applyTemplateSaveDefaults`).
  - [x] Read-only: the public Template page, Template detail and the editor preview list each
    field (label, type, "Required", help text, options) with `FormFieldList`.
  - [x] Run page: inputs by kind with help text and messages; answers save through the save
    queue (`saveRunFormAnswer`, typed answers on blur); Mark Complete and the task checkbox
    refuse a blocked task with the first field's message and move focus to it; a Sub-task
    never ticks a blocked task; `409 form_incomplete` is
    shown the same way; File fields upload when signed in; answers on a completed Run are
    read-only.
  - [x] Guest run: the same inputs and guard, "Log in to upload" for File fields, and Save to
    account carries answers by field id without carrying a blocked task as done.
  - [x] Shared run: answers read-only; a blocked task cannot be ticked ("This task can be
    ticked once its form is answered.").
  - [x] Docs (screen inventory, app map, features, FRONTEND, run execution, content types) and
    `tests/e2e/template-forms.spec.ts`.
- [ ] **PR 2, answers outside the run page:**
  - a CSV and JSON export of a run's answers;
    - [x] "Export answers" ("Download CSV", "Download JSON") in the header of the run page
      and the guest run when the Run has a form field, built in the browser
      (`runAnswersExport.ts`, `RunAnswersExportMenu`, `downloadFile`), with the formula
      guard, unit and DOM tests and a CSV step in `tests/e2e/template-forms.spec.ts`;
  - [x] an MCP `update_run` operation that sets an answer (validated by kind, frozen on completed
    runs, its text kept out of the audit diff): `set_form_answer` with `taskId`, `fieldId` and
    `answer`, MCP 0.6.0, whose release notes also cover PR 1's MCP changes; documented in
    [agent access](../../design-docs/agent-access.md) and tested in
    `agent-mcp-handler.form-answers.test.ts` and on SQLite in `run-form-guard-d1.test.ts`.

## Decision log

- 2026-10-06: Answers are keyed by **field id**, as Sub-task progress is keyed by Sub-task id,
  because block ids are not stable (the editor regenerates them on load and the structure
  comparison ignores them). Field ids get the same assignment, matching and uniqueness
  rules as Sub-task ids (`template-identities.ts`).
- 2026-10-06: The owner save validates against the stored run's field definitions, because
  `PUT /api/checklists/:id` otherwise trusts the client's sections. The shared-link merge
  already keeps the stored structure.
- 2026-10-06: Fields don't count toward progress. A required field gates its task, and the
  task is what progress counts. Counting each field would make a ten-field form dominate a
  run's percentage.
- 2026-10-06: The MCP template tools' JSON Schema for form blocks moved from PR 2 into PR 1.
  Their arguments already parse with the portable schema, which accepts form blocks, so
  agents could send forms the tool description never mentioned, and the block type list in
  that JSON Schema must agree with the others (`contentTypeLists.test.ts`).
- 2026-10-06: Text that is only whitespace is an empty answer, so spaces never satisfy a
  required field.
- 2026-10-06: A file answer is valid only with an upload URL: an http(s) or app-relative URL
  whose path ends in `/api/uploads/file` and carries a `key`, what the uploader returns.
- 2026-10-06: The run saves check only the tasks saved as done whose completion or answers
  changed, or which the stored run does not hold. A task already done with the answers it was
  done with is not checked again, so a run whose stored state predates a rule still saves
  its other changes.
- 2026-10-06: A refusal lists the blocking fields as `details: { fieldCount, fields }`, each
  `{ taskId, fieldId, reason }`, the first 50 of them, on every route.
- 2026-10-06: A retired form answer keeps its whole field, definition and answer, so options
  show by label; an empty answer is not retired. A removed task's retired copy shows its
  answers too.
- 2026-10-06: An option without an id gets `option-<n>` by position, the same on the server
  and the run page, so answers point at the same ids before and after the next save.
- 2026-10-06: The canonical portable form (Markdown, the bundled sources) keeps no field or
  option ids, as it keeps none for sections, tasks and Sub-tasks, and import gives them new
  ones. Duplicate field ids are therefore refused on save (`validateStableTemplateIdentities`)
  rather than by the bundled pack lint. The lint's empty form, blank label and missing
  options rules repeat rules the portable schema already enforces, which `templates:check`
  reports first as a parse error naming the problem, as `empty-subitems` repeats the
  Sub-tasks rule.
- 2026-10-06: The run audit lists the tasks whose answers changed as `answersChanged`, beside
  `notesChanged`, never the answer text, and an answer change is not an `edited` task.
- 2026-10-06: Typed answers save when the field loses focus, not per keystroke and not through
  a draft store like notes: one save per answer keeps the save queue and the revision check
  simple, and a field is left before Mark Complete or another task is clicked. The page checks
  the form inside the queued tick, on the latest Run, so an answer whose save is still on its
  way is never reported missing.
- 2026-10-06: Save drops a Dropdown or Multiple choice field left with no option, as it drops
  a Sub-tasks block left with no Sub-task: no one could answer it, and a required one would
  block its task for good.
- 2026-10-06: A ticked task counts as finished for completing the Run whatever its form holds, on
  the page (`isRunItemFinished`) and in the API (`findOpenRunTasks`), as the owner chose: a form
  gates ticking its task, not the Run. The screens briefly counted such a task as unfinished;
  `run-completion-rule.test.ts` caught the disagreement when the two halves met.
- 2026-10-06: A required Dropdown or Multiple choice field with no options never blocks its
  task (`findFormFieldProblem`). The editor drops it on save and the pack schema refuses it,
  but the stored schema is lenient like every stored shape, so a raw Template save could keep
  one and leave its task unable to be ticked in every run.
- 2026-10-06: The answers export is built in the browser from the Run the page holds, with no
  API route: the private page already has every answer the viewer may read, and a guest run's
  answers exist only in the browser. It is offered to a view-only role, who can read the
  answers anyway, and not on the shared run link, whose holders may not be the Run's people.
- 2026-10-06: The CSV puts a `'` before any cell starting with `=`, `+`, `-`, `@`, a tab or a
  CR, in every column, so a negative number reads `'-5` there; the JSON keeps the raw answer
  for anyone who needs the number. A file answer's text is its name and full link, resolved
  against the page's origin, so the CSV row leads to the file.
- 2026-10-06: MCP `set_form_answer` requires `answer`, and `null` is the answer that clears a
  field. Every other MCP argument treats `null` as absent, so `parseUpdateRunArguments` keeps a
  `null` `answer` for this operation only: an agent that leaves `answer` out gets
  `answer: Required` instead of silently clearing the field.
- 2026-10-06: An MCP answer is checked for its kind's type before the one rule, and only `null`
  clears every kind. `''`, `[]` and `false` clear the kinds they are a value of (text kinds and
  dates, multiple choice, checkbox), so `''` for a Number field is refused as the wrong type, not
  read as clearing it. A wrong type is `invalid_answer`, not `invalid_arguments`: which type is
  right depends on the field's kind, which only the stored run knows. Values no kind takes (an
  object, an array of numbers) are refused by the argument schema at the boundary.
- 2026-10-06: MCP cannot set a File answer (`unsupported_field_kind`), only clear one. A file answer
  must point at an upload, and agents have no upload path; the message sends them to the web app.
- 2026-10-06: Clearing a required answer through MCP is allowed while the task is open, but on a
  ticked task an answer that leaves its form blocking is refused with `form_incomplete`, as
  `PUT /api/checklists/:id` refuses the same save. Answering never ticks or unticks the task, so
  the alternative, a ticked task with a blocking form, is what every other save path prevents.
- 2026-10-06: MCP stores each Multiple choice option once, in the order sent: the one rule accepts
  repeated ids, but the run page never makes them and `formatFormAnswer` would list an option
  twice.
- 2026-10-06: The `set_form_answer` audit diff names the `taskId` and `fieldId` and lists the task
  in `answersChanged` only when the stored answer changed, so an answer sent again records no
  change; the answer itself is never in the diff, as notes are recorded only by length.
