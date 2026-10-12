# MCP changes for agents

Release notes for agents already using the Run Key MCP (`/api/mcp`), to quote when a version ships. The `initialize` result names the version (`serverInfo.version`, `MCP_SERVER_VERSION` in `functions/api/handlers/agentMcp.ts`), which goes up a minor version whenever what the tools take or return changes.

## 0.6.0 (from 0.5.0)

- **Tasks can hold a form.** `get_run` lists a `form` block's `fields` (`id`, `label`, `kind`, `required`, help text, `options` for `select` and `multiSelect`, `min` and `max` for `number`), each with the run's `answer` when it has one. `create_template` and `update_template` take `form` blocks with their `fields`; an `answer` sent there is dropped, since answers belong to runs.
- **A form gates its task.** `update_run` `set_task_completed` with `completed: true` fails with `form_incomplete` while a required field has no answer or an answer is not valid, its `details.fields` naming each `{ taskId, fieldId, reason }`, and ticking a task's last Sub-task completes the task only when its form is complete.
- **`update_run` fills answers** with the new operation `set_form_answer`: `taskId`, `fieldId` and `answer`, a string (text, long text, URL, email, and a `YYYY-MM-DD` date), a number, an option id (`select`), an array of option ids (`multiSelect`) or `true` (`checkbox`). `null` clears any field, as do `''`, `[]` and `false` for the kinds they fit, even a required one. An answer of the wrong type, or one that breaks the field's rule, fails with `invalid_answer` and the field's message; a file field can only be cleared (`unsupported_field_kind`), an unknown field is `field_not_found`, and a completed run refuses it with `run_completed`. Answering never ticks or unticks the task, and on a ticked task an answer that leaves its form incomplete fails with `form_incomplete`.

## 0.5.0 (from 0.4.0)

- **A completed run's tasks are frozen.** `update_run` with `set_task_completed` or `set_subtask_completed` on a completed run fails with `run_completed`, as the run page and share links refuse it; `set_task_notes` still works. `set_run_status` `in_progress` reopens the run first.
- **A reopen that loses a race for the last active run** (another run took it after the count) fails with `limit_reached`, not `edit_conflict`.

## 0.4.0 (from 0.3.0)

- **`get_template` returns `requiredTools`**: the tools a run of the template needs, each `{ name, url, required }`, in the template's fields (an empty list for none). An outline carries them in its template fields too.
- **`create_template` and `update_template` refuse `requiredTools`** with `invalid_arguments`: Required tools are edited in SERP Lists, and an update, whatever it replaces, keeps them.

## 0.3.0 (from 0.2.0)

- **Every result stays within 32KB**, what MCP clients take from one call. A template or run too large for one result no longer fails with `result_too_large`: `get_template` and `get_run` return its outline instead (its fields, `sectionsOmitted`, and each section's id, title, `taskCount` and `bytes`), and `sectionId`, `taskId` and `nextCursor` read the rest.
- **`get_run` reads a section or task the way `get_template` does**: `sectionId` returns `{ run, section }` and `taskId` returns `{ run, sectionId, task }`, a section too large for one result comes a page of tasks at a time (`firstTask`, `taskCount`), and anything larger on its own in `part`s of its JSON text. A run returned whole now includes its retired work (`retiredItems`); `retired: true` reads it on its own, all of it or one section's or task's.
- **Lists come a page at a time.** `list_templates` and `list_runs` no longer stop at 100 rows with `truncated`: while a result has `nextCursor`, call again with `cursor` set to it. Titles over 160 characters are cut; `get_template` and `get_run` return them whole.
- **Writes return less.** `update_run` returns the run's fields without its sections, the changed task's `sectionId` and `taskId`, and that task when it fits (`taskOmitted` otherwise). `start_run`, `create_template` and `update_template` return the run or template whole only when it fits in one result, otherwise its fields with `sectionsOmitted`.
- **`update_template` changes one part** with `operation`: `replace_section`, `insert_section`, `move_section`, `remove_section`, `replace_task`, `insert_task`, `move_task` or `remove_task`. `sections` still replaces the whole checklist; for a template read in pages, `operation` is the safe way to edit.
- **Notes have a byte limit.** `update_run` refuses notes over 20,000 characters or 30KB (30,720 bytes) of UTF-8 with `invalid_arguments`, naming both limits.
- **New refusals.** Completing a run (`set_run_status` `completed`) fails with `run_incomplete`, naming up to 20 open task ids, while a task or Sub-task is open, and `start_run` and `set_task_notes` fail with `content_too_large` past the web app's 896KB run content limit.
