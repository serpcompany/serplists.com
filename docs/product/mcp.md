# MCP changes for agents

Release notes for agents already using the Run Key MCP (`/api/mcp`), to quote when a version
ships; each note says what the tools have done since that version.

Abbreviations: **List tests** is `tests/unit/functions/api/agent-mcp-lists.test.ts`,
**MCP protocol tests** is `tests/unit/functions/api/agent-mcp-handler.protocol.test.ts`,
**MCP form tests** is `tests/unit/functions/api/agent-mcp-handler.forms.test.ts`,
**MCP form answer tests** is `tests/unit/functions/api/agent-mcp-handler.form-answers.test.ts`,
**Run freeze tests** is `tests/unit/functions/api/completed-run-freeze-d1.test.ts`,
**Reopen on D1 tests** is `tests/unit/functions/api/checklists-reopen-limit-d1.test.ts`,
**Required tools tests** is `tests/unit/functions/api/agent-mcp-required-tools.test.ts`,
**Result bound tests** is `tests/unit/functions/api/agent-mcp-result-bounds.test.ts`,
**Template page tests** is `tests/unit/functions/api/agent-mcp-template-pages.test.ts`,
**Run page tests** is `tests/unit/functions/api/agent-mcp-run-pages.test.ts`,
**Template edit tests** is `tests/unit/functions/api/agent-mcp-template-edits.test.ts`,
**Template tool tests** is `tests/unit/functions/api/agent-mcp-template-tools.test.ts`,
**MCP notes tests** is `tests/unit/functions/api/agent-mcp-handler.notes.test.ts`,
**MCP update tests** is `tests/unit/functions/api/agent-mcp-handler.update-run.test.ts`, and
**MCP size tests** is `tests/unit/functions/api/agent-mcp-handler.size-bounds.test.ts`.

**The version.** The `initialize` result names the version (`serverInfo.version`,
`MCP_SERVER_VERSION` in `functions/api/handlers/agentMcp.ts`), which goes up a minor version
whenever what the tools take or return changes.

- Check: MCP protocol tests, "names the server version, with release notes in the product spec
  that tell agents already using the MCP what it changes".

## 0.6.0 (from 0.5.0)

**Tasks can hold a form.** `get_run` lists a `form` block's `fields` (`id`, `label`, `kind`,
`required`, help text, `options` for `select` and `multiSelect`, `min` and `max` for `number`),
each with the run's `answer` when it has one. `create_template` and `update_template` take `form`
blocks with their `fields`; an `answer` sent there is dropped, since answers belong to runs.

- Check: MCP form tests, "shows get_run each form field with its answer, and no fields on other
  blocks, live or retired" and "lets an agent define a form in create_template, as the tool's JSON
  Schema and its parser both accept".

**A form gates its task.** `update_run` `set_task_completed` with `completed: true` fails with
`form_incomplete` while a required field has no answer or an answer is not valid, its
`details.fields` naming each `{ taskId, fieldId, reason }`, and ticking a task's last Sub-task
completes the task only when its form is complete.

- Check: MCP form tests, "refuses to complete a task whose form has an empty required field,
  naming the field, and saves nothing", "does not complete the task when its last subtask is
  ticked while its form blocks it" and "completes the task when its last subtask is ticked and its
  form is filled in".

**`update_run` fills answers** with the new operation `set_form_answer`: `taskId`, `fieldId` and
`answer`, a string (text, long text, URL, email, and a `YYYY-MM-DD` date), a number, an option id
(`select`), an array of option ids (`multiSelect`) or `true` (`checkbox`). `null` clears any
field, as do `''`, `[]` and `false` for the kinds they fit, even a required one.

- Check: MCP form answer tests, "sets a %s field's answer, returns the task with it, and leaves
  the task unticked" and "clears a required %s field sent %j, and keeps the other answers".

An answer of the wrong type, or one that breaks the field's rule, fails with `invalid_answer` and
the field's message; a file field can only be cleared (`unsupported_field_kind`), an unknown
field is `field_not_found`, and a completed run refuses it with `run_completed`.

- Check: MCP form answer tests, "refuses setting a file answer (%j), since agents have no upload,
  and writes nothing", "names a task or field the run does not hold" and "keeps a completed run's
  answers frozen, as ticks are".

Answering never ticks or unticks the task, and on a ticked task an answer that leaves its form
incomplete fails with `form_incomplete`.

- Check: MCP form answer tests, "answering never ticks or unticks the task".

## 0.5.0 (from 0.4.0)

**A completed run's tasks are frozen.** `update_run` with `set_task_completed` or
`set_subtask_completed` on a completed run fails with `run_completed`, as the run page and share
links refuse it; `set_task_notes` still works. `set_run_status` `in_progress` reopens the run
first.

- Check: Run freeze tests, "refuses a save that would $change, and writes nothing", "keeps task
  notes editable" and "reopens over MCP with set_run_status, after which set_task_completed works
  again".

**A reopen that loses a race for the last active run** (another run took it after the count)
fails with `limit_reached`, not `edit_conflict`.

- Check: Reopen on D1 tests, "refuses it with limit_reached when a concurrent reopen took the last
  active run after its count, inside the write".

## 0.4.0 (from 0.3.0)

**`get_template` returns `requiredTools`**: the tools a run of the template needs, each
`{ name, url, required }`, in the template's fields (an empty list for none). An outline carries
them in its template fields too.

- Check: Required tools tests, "returns requiredTools with the template from get_template" and
  "creates a template with no tools".

**`create_template` and `update_template` refuse `requiredTools`** with `invalid_arguments`:
Required tools are edited in SERP Lists, and an update, whatever it replaces, keeps them.

- Check: Required tools tests, "refuses requiredTools as an argument of update_template and
  create_template, so an agent cannot change or wipe them" and "keeps them through
  update_template, whether it replaces fields or runs an operation".

## 0.3.0 (from 0.2.0)

**Every result stays within 32KB**, what MCP clients take from one call.

- Check: Result bound tests, "has a case for every advertised tool, which a new tool fails until
  it has one" and "keeps every %s result within the bound".

A template or run too large for one result no longer fails with `result_too_large`:
`get_template` and `get_run` return its outline instead (its fields, `sectionsOmitted`, and each
section's id, title, `taskCount` and `bytes`), and `sectionId`, `taskId` and `nextCursor` read the
rest.

- Check: Template page tests, "returns a template whole up to the bound, and an outline one byte
  over", "outlines a larger template: its fields and counts, and each section's id, title (cut,
  where a section read returns it whole), tasks, and size" and "keeps every result within the
  bound and reads any template back in full".

**`get_run` reads a section or task the way `get_template` does**: `sectionId` returns
`{ run, section }` and `taskId` returns `{ run, sectionId, task }`, a section too large for one
result comes a page of tasks at a time (`firstTask`, `taskCount`), and anything larger on its own
in `part`s of its JSON text. A run returned whole now includes its retired work (`retiredItems`);
`retired: true` reads it on its own, all of it or one section's or task's.

- Check: Run page tests, "returns a section that fits whole, and a task that fits whole", "pages a
  section too large for one result a run of whole tasks at a time, its fields first", "returns a
  task whose notes are too large for one result in parts whose text joins into it", "reads retired
  work whole with retired: true, and a whole run carries it" and "narrows retired work to a
  section or a task, keeping every copy of a repeated id".

**Lists come a page at a time.** `list_templates` and `list_runs` no longer stop at 100 rows with
`truncated`: while a result has `nextCursor`, call again with `cursor` set to it. Titles over 160
characters are cut; `get_template` and `get_run` return them whole.

- Check: List tests, "lists every active Personal template once, newest change first, a page
  within the bound at a time, cutting long titles and descriptions" and "lists every active
  Personal run once, newest first, a page within the bound at a time".

**Writes return less.** `update_run` returns the run's fields without its sections, the changed
task's `sectionId` and `taskId`, and that task when it fits (`taskOmitted` otherwise). `start_run`
returns the run whole only when it fits in one result, otherwise its fields with
`sectionsOmitted`.

- Check: Run page tests, "returns a started run whole when it fits, otherwise its fields without
  sections" and "returns an update's run fields and the changed task when it fits, and names it
  otherwise".

`create_template` and `update_template` return the template whole only when it fits in one
result, otherwise its fields with `sectionsOmitted`.

- Check: Template page tests, "returns the whole template when it fits, naming what an operation
  changed" and "returns the template's fields and the changed task or section of a larger one,
  naming a section too large to return".

**`update_template` changes one part** with `operation`: `replace_section`, `insert_section`,
`move_section`, `remove_section`, `replace_task`, `insert_task`, `move_task` or `remove_task`.

- Check: Template edit tests, "update_template operations".

`sections` still replaces the whole checklist; for a template read in pages, `operation` is the
safe way to edit.

- Check: Template tool tests, "warns that sections, accepted for a template of any size, replaces
  the whole checklist, and to edit a template read in pages by part".

**Notes have a byte limit.** `update_run` refuses notes over 20,000 characters or 30KB (30,720
bytes) of UTF-8 with `invalid_arguments`, naming both limits.

- Check: MCP notes tests, "refuses notes %s, naming both limits, before reading the run" and
  "keeps the limits in the advertised schema".

**New refusals.** Completing a run (`set_run_status` `completed`) fails with `run_incomplete`,
naming up to 20 open task ids, while a task or Sub-task is open.

- Check: MCP update tests, "refuses a run with %s and writes nothing" and "names at most 20 open
  tasks".

`start_run` and `set_task_notes` fail with `content_too_large` past the web app's 896KB run
content limit.

- Check: MCP size tests, "rejects start_run on a template whose run would be too large to save,
  before writing anything" and "rejects set_task_notes that pushes a run past the content limit
  without writing".
