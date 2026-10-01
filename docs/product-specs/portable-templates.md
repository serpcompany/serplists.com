# Portable Templates

This document describes the portable template contract used for template export/import and the content structures stored in D1. Structural validation source of truth: `src/lib/schemas/checklistSchema.ts`.

The generated JSON Schema is [generated/portable-template-pack.schema.json](../generated/portable-template-pack.schema.json).

Copy-paste examples live in `portable-templates/examples/`: `minimal/` is the smallest
valid template and `full/` adds metadata, rules, and every content type. In each,
edit `template.yaml`; `template.json`, `template.md`, `README.md`, and `preview.html`
are generated from it and must pass `pnpm run templates:check`.

## Storage strategy (D1)
- `templates.items` stores the full sections JSON today's UI uses (array of sections with nested items/contents).
- `checklist_runs.items` stores the current sections JSON with completion state.
- Every write of that JSON from a request (template create, save, and import; run create and save) is checked against `src/lib/schemas/storedSections.ts` (a shared-run save takes the task structure from the stored run and only completion and notes from the request): `items`, `contents`, and `subItems` are arrays of objects, `title`, `description`, `notes`, and `value` are text, and a content block's `type` is one of `text`, `image`, `video`, `file`, `embed`, `subItems`. Ids, run state, and unknown keys pass through, and `null` counts as absent. A failure is a `400` (an `invalid_sections` failure on import) whose message names the path, for example `sections[0].items[2].contents[1].subItems: Expected array, received string`. Content stored before the check is made safe (a malformed Sub-task list becomes empty, a non-text value becomes empty text, a block with an unknown type is dropped, and so are sub-items on any block but a Sub-tasks block) when it is copied into a run or shown in the app, and `db/maintenance/find-malformed-checklist-content.sql` lists it for review.
- Section, item, and sub-item `id` values are stable identities. Renaming or reordering must retain them.
- `templates.content_version` advances only for checklist-structure changes. `checklist_runs.template_version` records the content version last applied; `revision` protects run writes from stale clients; `retired_items` preserves removed run state outside readiness calculations.
- Clients resend the full sections on every save, so `PUT /api/templates/:id` compares them with the stored structure (`functions/api/utils/template-changes.ts`): run state (`isCompleted`, `completed`, `notes`), key order, empty values, and a content block's own `id` are ignored, while text, section, task, and Sub-task ids, additions, removals, and reordering count. Content blocks are often stored without ids (seed and starter Templates, imports, and copies of those) and the editor gives each one a new id when it loads, so comparing those ids would turn the first save of such a Template into a structure change. Only a real structure change bumps `content_version` and reconciles runs. `templates.version` and a `template_versions` row advance whenever a stored field actually changes, visibility included (so an editor loaded before a Share gets `409 edit_conflict` rather than reverting it), and a save with no changes writes nothing. The response reports `version`, `content_version`, `structureChanged`, and `reconciledRuns`.
- Migration `0024` first normalizes legacy flat item arrays into the canonical `Checklist` section, then backfills deterministic path identities into template/run JSON and marks linked legacy runs stale (`template_version = 0`) because historical divergence cannot be inferred safely.
- The migration missed ids that are not text (numbers, booleans) or are only whitespace, and a save treats those as missing too. Template reads (`functions/api/utils/template-identities.ts`) give such a section, task, or sub-item the `legacy-section-N` / `legacy-item-S-I` / `legacy-subitem-S-I-K` id a save of the Template stores, and entries that are not objects stay where they are. The editor therefore resends the stored ids on every save, so a later save in the same session never renumbers the Template and retires run work. A copy of such a public Template and a run started from it (web or MCP `start_run`) get the same ids, and MCP `get_template` returns them, so an agent's `update_template` keeps them too. An `update_template` operation gives a section, task, or Sub-task it adds without an id one in the web editor's format (`section_<uuid>`, `item_<uuid>`, `subitem_<uuid>`), never a positional `legacy-*` id, which could repeat one the Template already holds.
- `templates.category` and `templates.tags` store JSON arrays as text.
- `templates.seo_title` and `templates.seo_description` store template SEO metadata.
- Structured columns (`user_id`, `is_public`, `slug`, timestamps) remain relational for filtering and indexing.

## Portable template pack format

Portable export is the preferred JSON format for sharing, AI generation, repo storage, and future GitHub sync.

```ts
export const portableTemplatePackSchema = z.object({
  kind: z.literal("serplists-template-pack"),
  schemaVersion: z.literal("2.0.0"),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  templates: z.array(portableChecklistTemplateSchema),
  manifest: z.object({
    totalTemplates: z.number(),
    format: z.literal("portable").optional(),
    includesVisibility: z.boolean().optional(),
    includesRules: z.boolean().optional(),
    assetWarnings: z.number().optional(),
    skippedTemplates: z.array(z.object({ title: z.string(), reason: z.string() })).optional(),
  }).optional(),
});
```

Export and import both pass each template through `parsePortableTemplate`
(`src/lib/schemas/portableTemplateNormalize.ts`) so every pack we write can be read
back, including packs exported before this normalization existed. It keeps ids and
fixes what the editor can save but the strict schema rejects:
- a blank section title becomes `Section N` and a blank task title `Task N` (N is the position, as the editor outline shows it)
- blank sub-tasks, sub-task blocks left empty, and image/video/file/embed blocks without a value are dropped
- `subItems` on a text, image, video, file or embed block are dropped: only a `subItems` block's rows are Sub-tasks, the ones the app shows
- sections without tasks are dropped, and an unknown `type` becomes `checklist`
- on content blocks and sub-tasks, a numeric `id` becomes a string and any other non-string `id` is dropped; on content blocks, a `fileName` that is not a string, a `fileSize` that is not a finite number, and an `uploadType` other than `url` or `upload` (including `null`, which a lenient JSON import can store) are dropped, and so are blank sub-tasks on any block

A template that still fails (for example one with no tasks) is left out of an export
and listed in `manifest.skippedTemplates`; `manifest.totalTemplates` counts only the
templates written. The export page then shows a warning that names each left-out
template and its reason instead of the success message, or an error with no download
when nothing could be exported. The template detail page's Export JSON does the same
for its one template: an error naming the reason, and no download. On import, it becomes a per-template failure instead
of rejecting the whole file.

`GET /api/templates/backup` exports the active context's own templates (Personal or
the Organization). "Include public community templates" adds, in the browser, the
public templates from the loaded catalog that the context does not own (never the
bundled library), and recomputes the manifest for the whole pack with the same
`buildPortablePackManifest` the API uses (`src/lib/schemas/portableTemplatePack.ts`).
Catalog rows carry no Organization id, so a catalog template counts as owned when its
id is in the page's template list or its slug is in the pack the server returned
(slugs are unique). The server's pack decides, so a list that failed to load or is
older than the catalog never writes a template twice. A template both the server
and the browser skipped is listed once in `manifest.skippedTemplates`. When the
template list fails to load, the export page shows the load error with Retry
instead of zero counts, and export still works.

Portable template fields are intentionally cleaner than app row exports:
- no `userId`
- no created/updated timestamps
- visibility is represented as `visibility: "public" | "private"`
- optional SEO metadata is represented as `seoTitle` / `seoDescription`
- optional portable rules are represented as `rules`
- sections/items/content IDs may be present, but import should not depend on them
- no run state: exports keep only the portable keys of sections (`id`, `title`,
  `items`), items (`id`, `title`, `description`, `contents`), content blocks (`id`,
  `type`, `value`, `uploadType`, `fileName`, `fileSize`, `subItems`) and sub-items
  (`id`, `title`), so `isCompleted`, `completed` and `notes` are left out
  (`src/lib/schemas/portableSections.ts`, used by both the app and the API export)

Content blocks are a union on `type`: `image`, `video`, `file` and `embed` need a
`value` that is not blank, `subItems` needs at least one sub-item, and `text` may be
empty. Import ignores keys it does not know rather than rejecting them, since SERP Lists'
own older exports carry keys such as `isCompleted`. The generated JSON Schema states the
same rules and allows additional properties, so a pack valid against it imports, and a pack
it rejects fails import too (`tests/unit/lib/schemas/portableTemplateJsonSchemaParity.test.ts`
checks both with Ajv). That is why the rules are part of each type's shape rather than Zod
refinements, which the JSON Schema cannot state, and why "not blank" is the pattern `\S`
rather than a trim. Every type has the same keys in the same order, so a parsed block has
one shape whatever its type.

An `image`, `video` or `file` block that links to a file outside the app shows its
`fileName` and `fileSize` only with `uploadType: "url"`. Without it they are treated as
left over from an earlier upload and are not shown. Import fills in
`uploadType: "url"` for a named link that has none (JSON, Markdown and YAML), so packs
written without it keep their names (`withImportedLinkSource` in
`src/lib/utils/mediaSource.ts`).

Portable round-trips must preserve `seoTitle`, `seoDescription`, and `rules`.
Rules are structurally stored and exported but are not executed or surfaced as
validation failures by the current runtime.

## Versioning and compatibility

Three versions serve different contracts:

- `templates.version` is the template's edit counter, used for save conflict
  checks (`expected_version`) and Changelog numbers. Create, import, and copy all
  start it at `1` (a copy never inherits its source's counter; the source's
  `version` and `content_version` go in the copy's audit event), and each save that
  changes a stored field advances it. `templates.content_version` counts checklist
  structure changes, which runs follow.
- Backup exports use root format version `1.0.0` and retain each template's
  `version`.
- Portable packs use `schemaVersion`; the current portable version is `2.0.0`.

When evolving a format, accept and migrate supported older versions during
import, keep portable exports on the latest version, and add a D1 migration if
stored template content also changes. Do not treat the portable pack version as
the D1 storage version.

## Practical authoring workflow

For human authoring, the recommended workflow is now YAML-first.

Current proven workflow:

1. Create or edit `template.yaml`.
2. Generate `template.json`, `README.md`, `preview.html`, and optional `template.md` from it.
3. Run `pnpm templates:check` to verify the generated artifacts are in sync.
4. Import the generated `template.json` or the original `template.yaml` through the template import flow.
5. Verify the imported template on the public site.

Commands:

```bash
pnpm templates:generate path/to/template.yaml
pnpm templates:check
```

This has now been verified end-to-end against the real site for the official `serp` publisher account.

Suggested untracked local file shape (the directory name is illustrative and must not be linked from tracked documentation):

```text
tmp/local-templates/{template-slug}/
  template.yaml
  template.json
  template.md
  README.md
  preview.html
```

Recommended usage:

- `template.yaml` is the primary user-authored source
- `template.json` is the generated normalized machine artifact
- `README.md` is the generated readable checklist preview
- `preview.html` is the generated richer card-style preview
- `template.md` is an optional generated strict Markdown compatibility artifact

Generated artifacts should not be edited by hand; regenerate them from `template.yaml`.

Copy-pasteable example assets:

- [minimal/template.json](portable-templates/examples/minimal/template.json)
- [minimal/README.md](portable-templates/examples/minimal/README.md)
- [minimal/preview.html](portable-templates/examples/minimal/preview.html)
- [minimal/template.md](portable-templates/examples/minimal/template.md)
- [minimal/template.yaml](portable-templates/examples/minimal/template.yaml)
- [full/template.json](portable-templates/examples/full/template.json)
- [full/README.md](portable-templates/examples/full/README.md)
- [full/preview.html](portable-templates/examples/full/preview.html)
- [full/template.md](portable-templates/examples/full/template.md)
- [full/template.yaml](portable-templates/examples/full/template.yaml)

Example live-tested payload:

- [camping-checklist.json](portable-templates/camping-checklist.json)
- [wedding-checklist.json](portable-templates/wedding-checklist.json)
- [comprehensive-template-demo.json](portable-templates/comprehensive-template-demo.json)

The current import UI derives access from the authenticated entitlement response.
`billingEnabled` controls whether checkout can start; it does not disable the
file picker for a User who already has import access. No direct API-post
workaround is required for an entitled User.

Export and import wait until the active context's Template list has loaded,
because until then a stored Organization can still read as Personal; the counts
show a dash meanwhile. The server alone decides whether there is anything to
export: an empty pack reports "No templates available to export" and downloads
nothing, so a list request that failed and looks empty never blocks an export.
Only one export runs at a time: while it runs, the button reads "Exporting..."
and it and the include-public switch are disabled, and further clicks are
ignored, so a double click sends one request and downloads one file.

Each file chosen in the picker replaces the previous preview, even when the new
file is rejected (wrong type, over 2MB, or invalid), so Confirm Import only ever
imports the last file chosen. The preview shows that file's name, and the picker
is cleared after every choice so an edited file can be chosen again under the
same name. The selection rules live in
`src/features/template-backup/importFileSelection.ts`.

## Backup/export format

Backup export remains supported for compatibility and restore-style workflows.

```ts
export const templateBackupSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  templates: z.array(checklistTemplateSchema),
  metadata: z.object({
    totalTemplates: z.number(),
    publicTemplates: z.number(),
    privateTemplates: z.number(),
  }).optional(),
});
```

## Import response contract

Backup and portable imports return a structured summary with `total`,
`imported`, `successes[]`, and `failed[]`. Successful entries identify their
input index, title, stored id, slug, and visibility. Failures identify their
index, title, human-readable reason, and stable code. Current failure codes are
`invalid_fields`, `invalid_sections`, `oversized_asset`, `content_too_large`, and
`insert_failed`.

`invalid_fields` means a template's fields exceed the bounds every save enforces
(`src/lib/schemas/templateLimits.ts`): a non-blank title of at most 160 characters,
description 5000, `seoTitle` 160, `seoDescription` 320, at most 20 categories and 20
tags of 80 characters, and rules with non-empty `id`, `type`, and `path`. The reason
names the field (for example `description: String must contain at most 5000
character(s)`). Imported values are never truncated. Generated slugs (import, clone,
create, and a de-duplicated slug on save) are shortened to fit 160 characters, and
Organization slugs to 120.

A template save (`PUT /api/templates/:id`) checks bounds only for fields whose value
changes, so a row that predates these bounds, or a legacy slug with punctuation, can
still be saved and toggled. A changed slug is normalized rather than rejected; one
with nothing left after normalizing (only non-Latin letters, for example) is a `400`
naming `slug` instead of being ignored.

Slugs are unique across all templates, archived ones included
(`idx_templates_slug_unique`), and are chosen by reading before writing
(`functions/api/utils/template-insert.ts`). Create, copy, and import take the clean
slug, then a `-<id>` suffix, then a random one; if a concurrent request claims the
slug before the write, the whole insert (template, first version, audit event) is
retried with a random suffix, up to 3 attempts, then `409 slug_taken`. Every attempt
of a create or copy keeps the template-limit check inside its write
([pricing and entitlements](pricing-and-entitlements.md)). An import reports a slug
that stays taken as `insert_failed`. A save that changes the slug to one another template
uses gets the `-<id>` suffix or a random one, each checked, and `409 slug_taken`
(with `details.slug`) when those are taken or another save claims the slug first.

A portable-pack template that fails validation after normalization is reported as an
`invalid_sections` failure at its index in the file; the envelope (`kind`,
`schemaVersion`) and the 5-template limit still apply to the whole file. The import
preview in the app skips such templates with a warning.

Mixed-result imports retain both lists. When every template fails, the API
returns `400` with `code: "template_import_failed"` and the full summary in
`details`, so clients must not discard all but the first failure. The import page
parses that summary and shows the same Failed Templates list either way (an untitled
template is named by its position), keeping the preview when nothing imported so the
file can be imported again. An `insert_failed` reason is a fixed message; the database
error is logged, not returned.

## Template structure
```ts
export const checklistTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(checklistSectionSchema),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
```

## Import formats (lenient)
We accept:
- portable template packs
- backup exports
- simple arrays of templates
- strict single-template Markdown files (`.md`, `.markdown`)
- strict single-template YAML files (`.yaml`, `.yml`)

Minimal template fields:
- `title` (required)
- `sections` **or** legacy `items` (required; JSON array, can be a stringified array)
- Optional: `description`, `categories`/`category`, `tags`, `isPublic`, `slug`, `seoTitle`, `seoDescription`, `rules`

Missing fields are auto-filled during import (ids, timestamps, userId).

In these lenient JSON formats a task or sub-task can be written as its title in text
(`"items": ["Milk", "Eggs"]`); it imports as a task with that title. Any other section,
task, content block or sub-task that is not an object (null, a number, a nested array,
empty text) fails the import with a message naming the template and where the entry
is, and `POST /api/templates/backup` refuses such a template with `invalid_sections`.

A file that fails validation is rejected before anything is sent, with a
one-line reason that names up to three problems by 1-based position, for example
`Template validation failed: Section 1 > title: String must contain at least 1 character(s)`.
YAML syntax errors report their line (`Invalid YAML at line 3: ...`). The shared
formatter is `src/lib/schemas/formatValidationError.ts`; a `ZodError`'s own message is a
JSON dump of its issues, so it is never shown as is.

## Strict Markdown template format

The strict Markdown dialect is still supported for compatibility and lintable round-trips, but it is no longer the recommended primary authoring format.

Rules:

- YAML frontmatter is required and must include at least `title`
- The `#` heading must match the frontmatter `title`
- `##` headings define sections
- `###` headings define items
- item description text can appear between the `###` heading and the first fenced content block
- structured content uses fenced blocks:
  - ```` ```serplists:text ````
  - ```` ```serplists:image ````
  - ```` ```serplists:video ````
  - ```` ```serplists:file ````
  - ```` ```serplists:embed ````
  - ```` ```serplists:subItems ````
- `subItems` blocks must contain a YAML array
- `text` and `embed` values may themselves contain headings and code fences. A
  block's fence is longer than any run of backticks that starts a line of its value
  (four backticks around a value with a 3-backtick code fence), and a block closes
  only on a line with exactly its opening number of backticks. Plain values keep
  3-backtick fences. Headings are recognized only outside blocks.
- a description line that would read as a `##`/`###` heading or a `serplists:` fence
  is written with one extra leading backslash (`\## Notes`); import removes it
- JSON and Markdown siblings named `template.json` and `template.md` can be checked for drift with `pnpm templates:check`
- `pnpm templates:check` also parses each template's generated Markdown back and
  reports `markdown-roundtrip` when it would not import as the same template

The example assets in `docs/product-specs/portable-templates/examples/` are the intended copy/paste starting point.

## Generated preview outputs

Generated outputs from `template.yaml` serve different purposes:

- `template.json` preserves the normalized portable machine format
- `README.md` is the readable checklist-style preview
- `preview.html` is the richer preview for image/video/file/embed cards

`README.md` is for readability and documentation, not perfect UI fidelity.
`preview.html` is the preview intended to approximate app content cards without depending on the app runtime.

### Rules
- Portable template packs can include an optional `rules` array on each template.
- Import/export preserves `rules` and validates their payload shape.
- Current runtime support is structural persistence only; rule execution and UI surfacing remain separate work.

### Visibility defaults
- If `isPublic` is present, it is preserved by default.
- If missing, templates default to **private** unless the importer overrides visibility.
- The import preview's public count follows the selected override ("Force public"
  or "Force private"), using the same rule as the import itself
  (`resolveImportIsPublic` in `src/lib/utils/templateBackup.ts`).

### Assets
JSON exports **do not** include R2 assets. If a template references uploaded files
(`image`/`video`/`file` contents with `uploadType: "upload"`), re-upload assets after import.

### Current import/export policy
- Template import/export is a **Pro** feature.
- Export defaults to the portable template pack format.
- Backup export is still available for compatibility.
- Guardrails are enforced: at most 5 templates per import, and a template with an
  asset whose recorded `fileSize` is over the 50MB upload limit fails with
  `oversized_asset` while the other templates in the file still import.
- A file may be up to 2MB, but one template's content may be at most 768KB
  (`src/lib/schemas/contentLimits.ts`): what its editor save and its runs can send back
  under the 1MB request limit. A larger template fails with `content_too_large` while the
  other templates in the file still import.
- Asset uploads are limited to 50MB each. Import accepts any size an upload can have
  (one shared limit, `src/lib/schemas/templateAssetLimits.ts`), so a template
  exported from the app always imports again; import copies asset URLs, not the files.
  The size it checks is the `fileSize` the file records, a hint rather than a guarantee,
  so a missing or invalid one is ignored.
- For live public-library publishing today, the imported template should be owned by the intended public publisher account before import, because author username is resolved from DB ownership, not from the portable JSON file.

`seoUrl` is represented by the stored `slug` field and mapped back into the editor's `Custom URL Slug` input.
A new or changed slug must be lowercase letters, numbers, and hyphens (160 characters
at most). An update that echoes the stored slug unchanged is accepted even when that
slug predates the rule (the legacy backfills in migrations 0002 and 0005), and it is
never rewritten on an unrelated save. `GET /api/templates/slug/:slug` percent-decodes
the slug before looking it up.

## Sections and items
```ts
export const checklistSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(checklistItemSchema),
});

export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contents: z.array(checklistItemContentSchema).optional(),
  isCompleted: z.boolean().optional(),
});
```

## Content types
```ts
export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems"]),
  value: z.string(),
  uploadType: z.enum(["url", "upload"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  subItems: z.array(checklistSubItemSchema).optional(),
});
```

- `value`: the URL of an image, video or file, the code or URL of an embed, the Markdown of
  a text block, and empty for a `subItems` block.
- `uploadType`: on an image, video or file block, whether `value` is an uploaded file
  (`upload`) or a link (`url`).
- `fileName` and `fileSize`: the original name and the size in bytes of the file `value`
  points to.

Supported types:
- `text` (markdown)
- `image`
- `video`
- `file`
- `embed` (URL, iframe embed code, or raw text). Nothing renders the value as HTML:
  the app and `preview.html` link to an absolute http(s) URL, or to the `src` of
  iframe code, and show any other value (script tags, plain text) as text
  (`src/lib/utils/embedLink.ts`).
- `subItems` (nested checklist)
