# Importing Templates

Importing a file of Templates on the Import/Export page (`POST /api/templates/backup`): the
formats it reads, the summary an import returns, the limits a file must keep, and how new Templates
get their slugs. Exporting is in [Import and export](template-import-export.md), and the pack
format in [Portable templates](portable-templates.md).

Abbreviations: **Backup API** is `tests/unit/functions/api/templates-handler.backup.test.ts`,
**Import file spec** is `tests/e2e/template-import-file-input.spec.ts`, **File selection** is
`tests/unit/features/template-backup/importFileSelection.test.ts`, **Backup parse** is
`tests/unit/lib/utils/templateBackup.parse.test.ts`, **Backup files** is
`tests/unit/lib/utils/templateBackup.files.test.ts`, **Import prep** is
`tests/unit/lib/utils/templateBackup.import.test.ts`, **Validation errors** is
`tests/unit/lib/schemas/formatValidationError.test.ts`, **Import preview** is
`tests/unit/components/TemplateImportPreview.test.tsx`, **Round trip** is
`tests/unit/lib/templates/portableRoundTrip.test.ts`, **Import summary spec** is
`tests/e2e/template-import-summary.spec.ts`, **Template bounds** is
`tests/unit/functions/api/templates-handler.bounds.test.ts`, **Portable import API** is
`tests/unit/functions/api/templates-portable-handler.import.test.ts`, **Content limits** is
`tests/unit/lib/schemas/contentLimits.test.ts`, **Asset limits** is
`tests/unit/lib/schemas/templateAssetLimits.test.ts`, **Slug conflicts** is
`tests/unit/functions/api/templates-slug-conflicts.test.ts`, and **Plan limits on D1** is
`tests/integration/plan-limits-concurrency-local-d1.test.ts`.

## The file and its preview

Each file chosen in the picker replaces the previous preview, which shows that file's name, and the
picker is cleared after every choice, so an edited file can be chosen again under the same name.
The selection rules are in `src/features/template-backup/importFileSelection.ts`.

- Check: Import file spec, "each chosen import file replaces the preview and clears the file
  input".

A rejected file (wrong type, over 2MB, or invalid) clears the previous preview too, so Confirm
Import only ever imports the last file chosen.

- Check: File selection, "rejects other file types and files over 2MB", "clears the previous
  preview when the next file is too large" and "clears the input after a parse failure so the fixed
  file can be chosen again".

Import accepts portable template packs, backup exports and simple arrays of Templates.

- Check: Backup parse, "should parse backup format" and "should parse simple array format".

It also accepts a strict single-template Markdown file (`.md`, `.markdown`) or YAML file (`.yaml`,
`.yml`) ([Authoring templates as files](template-authoring.md)).

- Check: Backup files, "should parse strict markdown template files" and "should parse
  single-template YAML files".

A Template needs a `title` and `sections`, or legacy `items` (a JSON array, which can be a
stringified array). It may have `description`, `categories` or `category`, `tags`, `isPublic`,
`slug`, `seoTitle`, `seoDescription`, `rules` and `requiredTools`. Missing fields are filled in
during import (ids, timestamps, `userId`).

- Check: Import prep, "should generate new IDs for all entities", "should update timestamps" and
  "should assign new user ID".

In these lenient JSON formats a task or Sub-task can be written as its title in text
(`"items": ["Milk", "Eggs"]`); it imports as a task with that title, and the flat `items` form and
a stringified array import the same way.

- Check: Backup parse, "imports text tasks in sections as titled tasks", "imports text sub-tasks as
  titled sub-tasks" and "imports the flat items form and a stringified array the same way".

Any other section, task, content block or Sub-task that is not an object (null, a number, a nested
array, empty text) fails the import with a message naming the Template and where the entry is, and
`POST /api/templates/backup` refuses such a Template with `invalid_sections`.

- Check: Backup API, "rejects imported sections, tasks or sub-tasks that are not objects, naming
  them as a person reads the file, not as a JSON path".

A file that fails validation is rejected before anything is sent, with a one-line reason that
names up to three problems by 1-based position, for example
`Template validation failed: Section 1 > title: String must contain at least 1 character(s)`.
YAML syntax errors report their line (`Invalid YAML at line 3: ...`). The shared formatter is
`src/lib/schemas/formatValidationError.ts`; a `ZodError`'s own message is a JSON dump of its
issues, so it is never shown as is.

- Check: Validation errors, "names the template, section and item with 1-based positions", "shows
  at most three issues and counts the rest" and "turns a multi-line YAML error into one line with
  its line number".

The preview names the file and lists its Templates. Its public count follows the selected
visibility ("Force public" or "Force private"), using the same rule as the import itself
(`resolveImportIsPublic` in `src/lib/utils/templateBackup.ts`).

- Check: Import preview, "names the chosen file and lists its templates", "counts public templates
  from the file when visibility is preserved" and "counts public templates after the selected
  visibility override".

The preview skips a Template that fails validation after normalization, with a warning.

- Check: Round trip, "skips an invalid template with a warning instead of rejecting the file".

Before Confirm Import, the preview applies the guardrails: a file over the 5-Template limit cannot
be confirmed, and oversized assets, counted with the API's own check
(`countOversizedTemplateAssets`), only raise a warning, since the rest of the file still imports.

- No automated check yet.

## What an import returns

Backup and portable imports return a structured summary with `total`, `imported`, `successes[]`
and `failed[]`. Successful entries identify their input index, title, stored id, slug and
visibility; failures identify their index, title, a readable reason and a stable code:
`invalid_fields`, `invalid_sections`, `oversized_asset`, `content_too_large` or `insert_failed`.

- Check: Import summary spec, "template import API returns structured per-template failures for
  rejected imports".

`invalid_fields` means a Template's fields exceed the bounds every save enforces
([field limits](template-editor.md#field-limits-slugs-and-search--seo)). The reason names the field
(for example `description: String must contain at most 5000 character(s)`), and imported values
are never truncated.

- Check: Template bounds, "fails only the imported templates whose fields exceed the bounds, naming
  the field".

A portable-pack Template that fails validation after normalization is an `invalid_sections` failure
at its index in the file; the envelope (`kind`, `schemaVersion`) and the 5-Template limit still
apply to the whole file.

- Check: Portable import API, "imports older packs with blank fields and fails only the invalid
  template" and "rejects unsupported portable schema versions".

Mixed-result imports keep both lists. When every Template fails, the API returns `400` with
`code: "template_import_failed"` and the full summary in `details`, so clients must not discard
all but the first failure.

- Check: Backup API, "should return per-template partial import results when some templates fail"
  and "should return structured failure details when all imported templates fail".

The import page parses that summary and shows the same Failed Templates list either way (an
untitled Template is named by its position), keeping the preview when nothing imported so the file
can be imported again.

- Check: Import summary spec, "the import page lists every failed template when none imported, and
  keeps the preview for another try".

An `insert_failed` reason is a fixed message; the database error is logged, not returned.

- Check: Backup API, "reports a failed template insert with a readable reason, not the database
  error".

## Limits

At most 5 Templates are imported per file.

- No automated check yet.

A file may be up to 2MB, but one Template's content may be at most 768KB
(`src/lib/schemas/contentLimits.ts`): what its editor save and its Runs can send back under the
1MB request limit. A larger Template fails with `content_too_large` while the other Templates in
the file still import.

- Check: Portable import API, "fails only the template whose content is too large to be saved
  again".

The content limits leave room under the save routes' body limit.

- Check: Content limits, "leave room under the save routes' body limit".

Asset uploads are limited to 50MB each, and import accepts any size an upload can have (one shared
limit, `src/lib/schemas/templateAssetLimits.ts`), so a Template exported from the app always
imports again. The size it checks is the `fileSize` the file records, a hint rather than a
guarantee, so a missing or invalid one is ignored.

- Check: Asset limits, "never blocks on import an asset the uploader accepted, so an export always
  imports again" and "does not count a missing or invalid size, which is only a hint from the
  imported file".

A Template with an asset whose recorded `fileSize` is over the 50MB upload limit fails with
`oversized_asset`, while the other Templates in the file still import.

- Check: Portable import API, "fails only the template whose asset is over the upload limit" and
  "imports assets up to the upload limit, so an export holding a 50MB upload imports again".

## Slugs on create, copy and import

Slugs are unique across all Templates, archived ones included (`idx_templates_slug_unique`), and
are chosen by reading before writing (`functions/api/utils/template-insert.ts`). Create, copy and
import take the clean slug, then a `-<id>` suffix, then a random one. If a concurrent request
claims the slug before the write, the whole insert (Template, first version, audit event) is
retried with a random suffix, up to 3 attempts, then `409 slug_taken`.

- Check: Slug conflicts, "retries with a fresh slug and returns the slug it saved" and "answers 409
  slug_taken, not a 500, when every attempt collides".

Generated slugs (import, copy, create, and a de-duplicated slug on save) are shortened to fit 160
characters, and Organization slugs to 120.

- Check: Template bounds, "keeps a suffixed slug within 160 characters when the requested slug is
  taken".

Every attempt of a create or copy keeps the Template-limit check inside its write
([pricing and entitlements](pricing-and-entitlements.md)).

- Check: Plan limits on D1, "creates only one template, with one version and one audit row" and
  "clones only one template into a Free Organization, the one copy target a Free template limit
  applies to".

An import reports a slug that stays taken as `insert_failed`.

- Check: Slug conflicts, "imports a template whose slug was claimed mid-import under a fresh slug"
  and "reports a readable import failure when every slug attempt collides".

A save that changes the slug to one another Template uses gets the `-<id>` suffix or a random one,
each checked, and `409 slug_taken` (with `details.slug`) when those are taken or another save
claims the slug first.

- Check: Slug conflicts, "checks the suffixed slug too, and picks another when both are taken",
  "answers 409 slug_taken when every candidate is taken" and "answers 409 slug_taken when another
  save claims the slug before this one writes".

## Publishing to the public library

For live public-library publishing today, the imported Template should be owned by the intended
public publisher account before import, because the author's username comes from who owns the
Template in D1, not from the portable JSON file.

- No automated check yet.
