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
  doesn't tick the task automatically. PR 2 adds an operation that fills answers.
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

- [ ] **PR 1, the Form block:** everything in Design above except the answers export and the
  MCP fill operation. MCP `get_run` shows fields and answers, and its guards apply.
- [ ] **PR 2, answers outside the run page:**
  - a CSV and JSON export of a run's answers;
  - an MCP `update_run` operation that sets an answer (validated by kind, frozen on completed
    runs, its text kept out of the audit diff);
  - the MCP template tools' JSON Schema for form blocks.

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
