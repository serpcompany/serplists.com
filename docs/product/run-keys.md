# Run Keys

What an agent (Claude Code, Codex or another MCP client) can do with a User's Personal Templates
and Runs through a Run Key, over the MCP endpoint `POST /api/mcp`. Changes to what the tools take
or return are announced in [MCP changes for agents](mcp.md).

Abbreviations: **MCP feature** is `tests/unit/functions/api/personal-run-mcp-feature.test.ts`,
**Run Key spec** is `tests/e2e/personal-run-mcp.spec.ts`, **Agent Access** is
`tests/unit/components/AgentAccessSection.test.tsx`, **Key permissions** is
`tests/unit/lib/schemas/runKeyPermissions.test.ts`, **MCP tools** is
`tests/unit/functions/api/agent-mcp-handler.tools.test.ts`, **MCP on D1** is
`tests/integration/personal-run-mcp-templates-local-d1.test.ts`, **MCP template tools** is
`tests/unit/functions/api/agent-mcp-template-tools.test.ts`, **MCP templates** is
`tests/unit/functions/api/agent-mcp-handler.templates.test.ts`, **Template history** is
`tests/unit/features/template-detail/templateHistoryTimeline.contract.test.ts`, **Run history** is
`tests/unit/components/run-execution/RunHistorySection.test.tsx`, **Result bounds** is
`tests/unit/functions/api/agent-mcp-result-bounds.test.ts`, **MCP lists** is
`tests/unit/functions/api/agent-mcp-lists.test.ts`, **Template pages** is
`tests/unit/functions/api/agent-mcp-template-pages.test.ts`, **Run pages** is
`tests/unit/functions/api/agent-mcp-run-pages.test.ts`, **Run updates** is
`tests/unit/functions/api/agent-mcp-handler.update-run.test.ts`, **Form answers** is
`tests/unit/functions/api/agent-mcp-handler.form-answers.test.ts`, **MCP notes** is
`tests/unit/functions/api/agent-mcp-handler.notes.test.ts`, **Size bounds** is
`tests/unit/functions/api/agent-mcp-handler.size-bounds.test.ts`, and **Template operations** is
`tests/unit/functions/api/agent-mcp-template-edits.test.ts`.

## Keys and permissions

Run Keys are on where `PERSONAL_RUN_MCP_ENABLED` is `"true"`, as `wrangler.toml` sets it for
staging and production, and on by default in local development. Where they are off, the MCP
endpoint and the Agent Access API answer `404`.

- Check: MCP feature, "defaults on locally and off remotely", "honors explicit enablement and
  disablement" and "matches only the MCP and Agent Access API routes".

A User creates Run Keys under Agent Access in Account Settings. A key is limited to the
permissions chosen when it is created, never changed afterwards: Read templates
(MCP `list_templates`, `get_template`), Write templates (`create_template`, `update_template`),
Read runs (`list_runs`, `get_run`) and Write runs (`start_run`, `update_run`).

- Check: Run Key spec, "the permissions chosen for a Run Key decide what it can do over MCP".

A new key has every permission but Write templates.

- Check: Agent Access, "renders the create state with permission choices that default to no
  template writes".

Write runs needs Read templates, since starting a run copies the template, and unticking a read in
the form also unticks the writes that need it.

- Check: Key permissions, "treats writing runs as reading templates, because a new run copies
  template content" and "turns on the implied read and turns off writes that depend on a removed
  read".

The MCP lists only the tools a key may use and refuses the others with `permission_denied`.

- Check: MCP tools, "offers and allows only the tools a key's permissions cover".

## Template writes

A key writes only its owner's private Personal Templates: it cannot delete or publish one, edit a
public one (`template_is_public`) or reach an Organization's.

- Check: MCP on D1, "keeps template writes inside the key owner's private personal templates".

Its writes go through the web editor's code (`createTemplateForUser` in
`functions/api/handlers/template-create.ts`, `updateTemplateForUser` in
`functions/api/handlers/template-update.ts`), so they get the same validation, Template limit,
version check (`expectedVersion`, `edit_conflict`), history and run sync.

- Check: MCP template tools, "saves the whole checklist with one task added, through the editor's
  code, naming the key and operation in its history" and "refuses a stale version, a public
  template, and an unknown section before writing".

A Template's Required tools are read-only to a key: `get_template` returns them, and
`create_template` and `update_template` refuse them ([Required tools](required-tools.md)).
`get_template` also gives entries stored without ids the ids a save stores, so an agent that sends
them back keeps its runs' progress.

- Check: MCP templates, "reads a template stored without ids with the ids its runs and next save
  use, so sending them back keeps the runs' progress".

Their audit events record the key (`source: "mcp"`, `personalRunKeyId`, `personalRunKeyName`), so
the Activity of the Template names an Agent's change
`<Run Key name> via MCP · authorized by <user>`.

- Check: Template history, "names the Run Key that each write's audit event records behind an
  Agent's create and edit, as the run's Changelog does".

The Activity of each run the edit updates names it the same way.

- Check: Run history, "keeps the MCP actor format".

`update_template` either replaces the fields it is given (`sections` replaces the whole checklist)
or, with `operation`, changes one section or task, so an agent never sends more than it read:
`replace_section`, `insert_section`, `move_section`, `remove_section`, `replace_task`,
`insert_task`, `move_task` and `remove_task`.

- Check: Template operations, "update_template operations".

A replace keeps the fields it is not given, new sections, tasks and Sub-tasks get ids in the web
editor's format, a section keeps at least one task and a Template one section, and the audit event
records the operation.

- Check: Template operations, "replace_section changes the fields it is given and keeps the rest",
  "insert_section adds a section before another or at the end, with ids for what lacks one",
  "remove_section removes a section but never the last one" and "remove_task removes a task but
  never a section's last one".

`sections` is still accepted for a Template too large to read in one result, and the tool
description warns plainly that it replaces the whole checklist, removing whatever it leaves out,
and that `operation` is the safe way to edit a Template read in pages.

- Check: MCP template tools, "warns that sections, accepted for a template of any size, replaces
  the whole checklist, and to edit a template read in pages by part".

A create or update whose Template is too large to return comes back without its sections
(`sectionsOmitted`), with the section or task an operation changed.

- Check: Template pages, "returns the whole template when it fits, naming what an operation
  changed" and "returns the template's fields and the changed task or section of a larger one,
  naming a section too large to return".

## Results and paging

Every MCP tool result stays within 32KB, which MCP clients take from one call whole
(`MAX_RESULT_BYTES` in `functions/api/handlers/agentMcpPages.ts`), and every Template and Run,
whatever its size, can still be read in full.

- Check: Result bounds, "has a case for every advertised tool, which a new tool fails until it has
  one" and "names the bound in every tool description that promises it".

`list_templates` (most recently edited or created first) and `list_runs` (newest first) return a
page of summaries at a time, with `nextCursor` for the next page. Titles over 160 characters and
descriptions over 500 are cut, and `list_runs` keeps its `status` filter in the cursor.

- Check: MCP lists, "lists every active Personal template once, newest change first, a page within
  the bound at a time, cutting long titles and descriptions", "lists every active Personal run
  once, newest first, a page within the bound at a time" and "keeps the status filter in its
  cursor, so a continuation may leave it out or repeat it".

`get_template` returns a Template whole when it fits. A larger one comes back as an outline (its
fields, and each section's id, title, task count and size; `sectionsOmitted`). `sectionId` or
`taskId` reads one section or task, a section too large for one result comes back a page of tasks
at a time (`firstTask`, `taskCount`), and anything too large for a result on its own (a very long
task) as parts of its JSON text.

- Check: Template pages, "returns a template whole up to the bound, and an outline one byte over",
  "pages a section too large for one result a run of whole tasks at a time, its fields first",
  "returns a task too large for one result in parts whose text joins into it" and "keeps every
  result within the bound and reads any template back in full".

`get_run` reads a Run the same way; its outline also counts its retired work, and a very long note
comes back in parts.

- Check: Run pages, "returns a run whole up to the bound, and an outline one byte over", "outlines
  a larger run: its fields, counts, retired work, and each section's id, title, tasks, and size",
  "returns a task whose notes are too large for one result in parts whose text joins into it" and
  "keeps every result within the bound and reads any run back in full".

`nextCursor` continues a read from the version, or the run revision, it started on, and fails with
`edit_conflict` once the Template or Run changes.

- Check: Template pages, "continues a read from the version it started on, with or without the
  section it reads, and fails with edit_conflict after a change".

The same holds for a Run's revision.

- Check: Run pages, "continues a read from the revision it started on, and fails with edit_conflict
  after a change".

`get_run` returns a Run's retired work (`retiredItems`) with the run when it fits, and
`retired: true` reads it on its own, a page of whole entries at a time (all of it, or one
`sectionId`'s or `taskId`'s), so a run with large retired work can still be read in full. A read of
a section or task that only retired work holds says to pass `retired: true`
([Runs follow their Template](run-template-updates.md)).

- Check: Run pages, "reads retired work whole with retired: true, and a whole run carries it",
  "narrows retired work to a section or a task, keeping every copy of a repeated id", "names ids
  that neither live nor retired work holds, and points live reads of retired ids at retired: true"
  and "pages retired work too large for one result, all of it or a section's, whole entries first
  and parts of any larger one".

## Run writes

`start_run` returns the new run whole when it fits, otherwise its fields (`sectionsOmitted`).

- Check: Run pages, "returns a started run whole when it fits, otherwise its fields without
  sections".

`update_run` changes one task's completion or notes, one Sub-task (by `subtaskId`, which for a
legacy Sub-task stored with a numeric id is that number as text, such as `"7"`), or the run's
status.

- Check: Run updates, "updates a subtask, synchronizes its parent, and returns the next revision"
  and "updates a legacy Sub-task stored with a numeric id when named by that id's text, and keeps
  the stored id".

It returns the run's fields, the changed task's `sectionId` and `taskId`, and that task when it
fits (`taskOmitted` otherwise).

- Check: Run pages, "returns an update's run fields and the changed task when it fits, and names
  it otherwise".

It also sets one answer in a task's Form (`set_form_answer`, by `fieldId`), checked with the run
page's rule for its type. A File answer can only be cleared, since agents cannot upload, and an
answer never ticks or unticks its task ([Forms on a Run](run-forms.md)).

- Check: Form answers, "update_run set_form_answer" and "answering never ticks or unticks the
  task".

The notes it writes are at most 20,000 characters and 30KB (30,720 bytes) of UTF-8
(`MAX_TASK_NOTES_BYTES` in `functions/api/handlers/agentMcpTools.ts`), so an agent reads back what
it wrote in one result; longer notes fail with `invalid_arguments`, naming both limits. Notes
written in the web app can be longer: `get_run` reads them in parts, and an agent can replace them
with notes within the limit.

- Check: MCP notes, "keeps the limits in the advertised schema" and "replaces longer notes written
  in the web app, which get_run reads in parts".

Run Key run writes keep the web app's run content limit (`content_too_large`), so an agent can
start a run from any Template the web app can.

- Check: Size bounds, "rejects start_run on a template whose run would be too large to save, before
  writing anything", "starts a run from a template at the template limit and returns its fields
  without sections" and "rejects set_task_notes that pushes a run past the content limit without
  writing".
