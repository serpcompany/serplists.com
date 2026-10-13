# Template storage

How D1 stores a Template's and a Run's content, checks it on every write, and keeps its ids stable
across saves and migrations. The portable file format is in
[Portable templates](portable-templates.md).

Abbreviations: **Template mapping** is `tests/unit/contexts/TemplatesContext.test.ts`,
**Stored sections** is `tests/unit/lib/schemas/storedSections.test.ts`, **Malformed query** is
`tests/unit/db/find-malformed-checklist-content.test.ts`, **Form identities** is
`tests/unit/functions/api/template-identities.forms.test.ts`, **Template saves** is
`tests/unit/functions/api/templates-handler.reconcile.test.ts`, **Structure changes** is
`tests/unit/functions/api/template-changes.test.ts`, **Identities** is
`tests/unit/functions/api/template-identities.test.ts`, **Legacy identities** is
`tests/unit/functions/api/templates-legacy-identities.test.ts`, and **Template operations** is
`tests/unit/functions/api/agent-mcp-template-edits.test.ts`.

## Storage strategy (D1)

`templates.items` stores the full sections JSON the UI uses (an array of sections with nested items
and contents), and `checklist_runs.items` the current sections JSON with completion state.
`templates.category` and `templates.tags` store JSON arrays as text, `templates.seo_title` and
`templates.seo_description` the Template's SEO metadata, and structured columns (`user_id`,
`is_public`, `slug`, timestamps) stay relational for filtering and indexing.

- Check: Template mapping, "reads the items column the same whether it arrives as JSON text or as
  an array" and "keeps the categories, the tags stored as JSON text and the visibility".

Every write of that JSON from a request (Template create, save and import; run create and save) is
checked against `src/lib/schemas/storedSections.ts`; a shared-run save takes the task structure
from the stored run and only completion and notes from the request. `items`, `contents` and
`subItems` are arrays of objects; `title`, `description`, `notes` and `value` are text; a content
block's `type` is one of `text`, `image`, `video`, `file`, `embed`, `subItems`, `form`. A form's
`fields` is an array of objects with a known `kind`, `label` and `description` are text,
`required` is true or false, `options` is an array of objects with a text `label`, `min` and `max`
are numbers, and an `answer` has its kind's shape. Ids, run state and unknown keys pass through,
and `null` counts as absent. A failure is a `400` (an `invalid_sections` failure on import) whose
message names the path, for example
`sections[0].items[2].contents[1].subItems: Expected array, received string`.

- Check: Stored sections, "findStoredSectionsIssue", "names the exact field" and "accepts every
  legacy and run shape the app stores".

Content stored before that check is made safe when it is copied into a run or shown in the app: a
malformed Sub-task list becomes empty, a non-text value becomes empty text, and a block with an
unknown type is dropped, as are Sub-items on any block but a Sub-tasks block, a form field of an
unknown kind, keys a field's kind does not use, an answer of the wrong shape, and `fields` on any
block but a form.

- Check: Stored sections, "turns a malformed Sub-task list into an empty one and a non-text value
  into empty text" and "always produces storable sections from random JSON".

`db/maintenance/find-malformed-checklist-content.sql` lists such content for review.

- Check: Malformed query, "finds nothing in content the API accepts, including legacy flat rows"
  and "names the path and the problem, and finds invalid JSON".

Section, item, Sub-item and form field `id` values are stable identities: renaming or reordering
keeps them. Form answers are keyed by field id, and a form option's `id` is what a choice answer
stores.

- Check: Form identities, "form field identities, which answers are keyed by" and "requires an id
  on every field and refuses an id used twice anywhere in the Template".

`templates.content_version` advances only for checklist structure changes.
`checklist_runs.template_version` records the content version last applied, `revision` protects
run writes from stale clients, and `retired_items` keeps removed run state outside readiness
([Runs follow their Template](run-template-updates.md)).

- Check: Template saves, "saves metadata edits without bumping content_version or rewriting runs".

Clients resend the full sections on every save, so `PUT /api/templates/:id` compares them with the
stored structure (`functions/api/utils/template-changes.ts`). Run state (`isCompleted`,
`completed`, `notes`, a form field's `answer`), key order, empty values and a content block's own
`id` are ignored, while text, section, task and Sub-task ids, additions, removals and reordering
count. Content blocks are often stored without ids (seed and starter Templates, imports, and
copies of those) and the editor gives each one a new id when it loads, so comparing those ids
would turn the first save of such a Template into a structure change. Only a real structure change
bumps `content_version` and reconciles Runs.

- Check: Structure changes, "treats resent sections with run state, key order, and empty defaults
  as unchanged", "treats form answers as run state, and a changed field definition as a change" and
  "treats a save of stored id-less content blocks as unchanged".

`templates.version` and a `template_versions` row advance whenever a stored field actually
changes, visibility included, so an editor loaded before a Share gets `409 edit_conflict` rather
than reverting it; a save with no changes writes nothing. The response reports `version`,
`content_version`, `structureChanged` and `reconciledRuns`.

- Check: Template saves, "versions a visibility change, so a stale editor gets a conflict, without
  touching content or runs", "rejects an editor save made before a visibility change" and "accepts a
  save with no changes without writing anything".

Migration `0024` first normalized legacy flat item arrays into the canonical `Checklist` section,
then backfilled deterministic path identities into Template and run JSON and marked linked legacy
runs stale (`template_version = 0`), because historical divergence cannot be inferred safely. A
save still matches a legacy flat item array against that `Checklist` section.

- Check: Structure changes, "matches legacy flat item arrays against the canonical Checklist
  section" and "matches stored sections without ids against the ids assigned by position".

The migration missed ids that are not text (numbers, booleans) or are only whitespace, and a save
treats those as missing too. Template reads (`functions/api/utils/template-identities.ts`) give
such a section, task or Sub-item the `legacy-section-N` / `legacy-item-S-I` /
`legacy-subitem-S-I-K` id a save of the Template stores, and entries that are not objects stay
where they are. The editor therefore resends the stored ids on every save, so a later save in the
same session never renumbers the Template and retires run work.

- Check: Identities, "gives each entry without an accepted id the id a save stores, and keeps
  accepted ids", "leaves entries that are not objects where they are, numbering the others as a save
  does" and "lets an editor that sends the ids back save without renumbering or a structure change,
  then and on the next load and save".

A copy of such a public Template and a run started from it (web or MCP `start_run`) get the same
ids, and MCP `get_template` returns them, so an agent's `update_template` keeps them too.

- Check: Legacy identities, "gives a copy of a public Template stored without ids the ids its
  editor and runs use" and "stores nothing when the second save changes nothing".

An `update_template` operation gives a section, task or Sub-task it adds without an id one in the
web editor's format (`section_<uuid>`, `item_<uuid>`, `subitem_<uuid>`), never a positional
`legacy-*` id, which could repeat one the Template already holds.

- Check: Template operations, "insert_section adds a section before another or at the end, with ids
  for what lacks one" and "insert_task adds a task before another or at the end of a section".
