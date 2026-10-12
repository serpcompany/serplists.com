# Portable templates

The portable template pack, the JSON format Template import and export use, and its versions. How
D1 stores a Template's content is in [Template storage](template-storage.md). The structural source
of truth is
`src/lib/schemas/checklistSchema.ts`, and the generated JSON Schema is
[portable-template-pack.schema.json](../api/portable-template-pack.schema.json). The page that
imports and exports packs is in [Import and export](template-import-export.md), and writing a
Template as a file in [Authoring templates as files](template-authoring.md).

Abbreviations: **Pack schema** is `tests/unit/lib/schemas/portableTemplateSchema.test.ts`,
**JSON Schema parity** is `tests/unit/lib/schemas/portableTemplateJsonSchemaParity.test.ts`,
**JSON Schema file** is `tests/unit/lib/schemas/portableTemplateJsonSchemaArtifact.test.ts`,
**Normalize** is `tests/unit/lib/schemas/portableTemplateNormalize.test.ts`, **Round trip** is
`tests/unit/lib/templates/portableRoundTrip.test.ts`, **Portable utilities** is
`tests/unit/lib/utils/templatePortable.test.ts`, **Portable export API** is
`tests/unit/functions/api/templates-portable-handler.export.test.ts`, **Portable import API** is
`tests/unit/functions/api/templates-portable-handler.import.test.ts`, **Named links** is
`tests/unit/lib/utils/templateBackup.namedLinks.test.tsx`, **Embed links** is
`tests/unit/lib/utils/embedLink.test.ts`, **Backup parse** is
`tests/unit/lib/utils/templateBackup.parse.test.ts`, **Import prep** is
`tests/unit/lib/utils/templateBackup.import.test.ts`, **App copies** is
`tests/unit/lib/templates/requiredToolsPortable.test.ts`, **Tools on runs and packs** is
`tests/unit/functions/api/template-required-tools-pack-d1.test.ts`, **Clone API** is
`tests/unit/functions/api/templates-handler.clone.test.ts`, and **Backup API** is
`tests/unit/functions/api/templates-handler.backup.test.ts`.

## Portable template pack format

Portable export is the preferred JSON format for sharing, AI generation, repository storage and
future GitHub sync. A pack is an object with `kind: "serplists-template-pack"`, a `schemaVersion`
of `2.0.0` or `2.1.0`, `exportedAt`, an optional `exportedBy`, its `templates`, and an optional
`manifest` (`totalTemplates`, `format: "portable"`, `includesVisibility`, `includesRules`,
`assetWarnings`, and `skippedTemplates`, each a `title` and a `reason`).

- Check: Pack schema, "validates a portable template pack" and "rejects unsupported schema
  versions at the canonical contract layer".

The generated JSON Schema states the same rules and allows additional properties, so a pack valid
against it imports, and a pack it rejects fails import too. That is why the rules are part of each
type's shape rather than Zod refinements, which the JSON Schema cannot state, and why "not blank"
is the pattern `\S` rather than a trim. Every type has the same keys in the same order, so a
parsed block has one shape whatever its type.

- Check: JSON Schema parity, "the published portable template JSON Schema accepts exactly what the
  importer accepts" and "agrees on the repo examples and public packs".

The JSON Schema file is generated from the Zod contract, and `pnpm run schema:portable:check`
fails when it is out of date.

- Check: JSON Schema file, "matches the generated schema from the canonical Zod contract".

Export and import both pass each Template through `parsePortableTemplate`
(`src/lib/schemas/portableTemplateNormalize.ts`), so every pack the app writes can be read back,
including packs exported before this normalization existed. It keeps ids and fixes what the editor
can save but the strict schema rejects: a blank section title becomes `Section N` and a blank task
title `Task N` (N is the position, as the editor outline shows it); blank Sub-tasks, Sub-task
blocks left empty, and image, video, file or embed blocks without a value are dropped; sections
without tasks are dropped, and an unknown `type` becomes `checklist`.

- Check: Round trip, "imports packs exported before the fix, with blank titles and empty media"
  and "exports editor-built templates with every content type the editor can add as a pack its own
  importer accepts".

It also drops `subItems` on a text, image, video, file or embed block (only a `subItems` block's
rows are Sub-tasks, the ones the app shows) and blank Sub-tasks on any block. In a `form` block it
drops answers, fields with a blank label or an unknown kind, blank options, choice fields left
without options and forms left without fields, and it drops `fields` on any other block. On
content blocks and Sub-tasks a numeric `id` becomes a string and any other non-string `id` is
dropped; on content blocks, a `fileName` that is not a string, a `fileSize` that is not a finite
number, and an `uploadType` other than `url` or `upload` (including `null`, which a lenient JSON
import can store) are dropped.

- Check: Normalize, "keeps sub-items only on Sub-tasks blocks, the only ones the run page shows",
  "cleans Sub-task ids, drops blank Sub-tasks, and drops sub-items on other blocks", "cleans form
  blocks: drops answers, blank fields, blank options, choice fields left without options and forms
  left empty" and "turns a numeric id into a string and drops null or ill-typed optional keys".

A Template that still fails (for example one with no tasks) is left out of an export and listed in
`manifest.skippedTemplates`, and `manifest.totalTemplates` counts only the Templates written. On
import it becomes a failure of that Template instead of rejecting the whole file, unless no
Template in the file is valid.

- Check: Round trip, "skips an invalid template with a warning instead of rejecting the file" and
  "still rejects a file when no template in it is valid".

## Portable fields

Portable Template fields are cleaner than app row exports: no `userId` and no created or updated
timestamps; visibility is `visibility: "public" | "private"`; optional SEO metadata is `seoTitle`
and `seoDescription`, optional rules are `rules`, and optional Required tools are `requiredTools`,
a list of `{ name, url, required }` ([below](#required-tools)). Section, item and content ids may be
present, but an import does not depend on them.

- Check: Portable utilities, "exports a portable template pack" and "parses a portable template
  pack into normalized templates".

Packs carry no run state. Exports keep only the portable keys of sections (`id`, `title`,
`items`), items (`id`, `title`, `description`, `contents`), content blocks (`id`, `type`, `value`,
`uploadType`, `fileName`, `fileSize`, `subItems`, and `fields` on a `form` block), Sub-items (`id`,
`title`), form fields (`id`, `label`, `kind`, `required`, `description`, `options`, `min`, `max`)
and options (`id`, `label`), so `isCompleted`, `completed`, `notes` and form answers are left out
(`src/lib/schemas/portableSections.ts`, used by both the app and the API export).

- Check: Portable export API, "exports stored templates without the run state their sections
  carry, valid against the JSON Schema and importable again".

Import ignores keys it does not know rather than rejecting them, since SERP Lists' own older
exports carry keys such as `isCompleted`.

- Check: JSON Schema parity, "validates after an import added completion state to every task" and
  "leaves out run state and other keys that are not part of the portable format".

## Content blocks

Content blocks are a union on `type`: `image`, `video`, `file` and `embed` need a `value` that is
not blank, `subItems` needs at least one Sub-item, `form` needs between 1 and 50 fields, and
`text` may be empty. A form field is a union on `kind`: each has a label that is not blank (200
characters at most) and may have `required` and `description` (1,000 characters at most);
`select` and `multiSelect` need 1 to 50 options, each with a label that is not blank; `number` may
have `min` and `max`.

- Check: Pack schema, "rejects subItems content without nested sub-items" and "rejects media
  content without a value".

`value` is the URL of an image, video or file, the code or URL of an embed, the Markdown of a text
block, and empty for a `subItems` or `form` block. On an image, video or file block, `uploadType`
says whether `value` is an uploaded file (`upload`) or a link (`url`), and `fileName` and
`fileSize` give the original name and the size in bytes of the file `value` points to.

- Check: Round trip, "exports editor-built templates with every content type the editor can add as
  a pack its own importer accepts".

An image, video or file block that links to a file outside the app shows its `fileName` and
`fileSize` only with `uploadType: "url"`; without it they are treated as left over from an earlier
upload and not shown. Import fills in `uploadType: "url"` for a named link that has none (JSON,
Markdown and YAML), so packs written without it keep their names (`withImportedLinkSource` in
`src/lib/utils/mediaSource.ts`).

- Check: Named links, "marks it as a link so the editor, which keeps a name only next to a link,
  keeps its name and size", "marks it in an app backup too" and "marks it in a Markdown file".

An `embed` holds a URL, iframe embed code, or raw text. Nothing renders the value as HTML: the app
and `preview.html` link to an absolute http(s) URL, or to the `src` of iframe code, and show any
other value (script tags, plain text) as text (`src/lib/utils/embedLink.ts`).

- Check: Embed links, "getEmbedLinkUrl" and "links a URL".

A `form` holds the fields every run fills in: short text, long text, URL, email, number, date,
dropdown, multiple choice, checkbox and file. A Template holds only the field definitions; answers
live on a run's copy and never leave it in a pack. A task whose Form has a required field without
an answer, or an answer that is not valid, can't be marked done
([form blocks](../agents/template-content-types.md#form-blocks)).

- Check: Portable import API, "imports a 2.1.0 pack with a form, giving its fields ids and storing
  no answers".

A `subItems` block is a nested checklist, and `text` is Markdown.

- Check: Pack schema, "validates a portable template pack".

## Rules, Required tools, visibility and assets

Portable round trips preserve `seoTitle`, `seoDescription`, `rules` and `requiredTools`. A
Template may carry an optional `rules` array; import and export keep it and check its shape, but
the current runtime only stores rules: it neither executes them nor shows them as validation
failures.

- Check: Backup parse, "should preserve seo metadata and rules from portable imports".

### Required tools

A Template can list the tools a Run of it needs as `requiredTools`: each entry has a `name` that is
not blank, a `url`, and `required` (`true` or `false`; left out, it reads as `true`). The schema is
`src/lib/schemas/requiredTools.ts`, shared by the API, the app and this format.

- Check: App copies, "reads a tool written without its required flag as required, in a pack and in
  a plain list of Templates".

A `url` is an `http://` or `https://` address with a host and no spaces, `<`, `>` or `"`, so every
stored tool can be linked as it is. The format, like its JSON Schema, sets no lengths (JSON Schema
counts characters differently from the importer); the API enforces them on import as it does for
titles: at most 20 tools, names of 80 characters and URLs of 2048, else `invalid_fields` naming the
field (for example `requiredTools.0.name: Tool names must be 80 characters or fewer`). A pack whose
tool fails any of this is refused for that Template alone.

- Check: Tools on runs and packs, "imports the tools a pack holds, and refuses only the Template
  whose tools it cannot store".

Exports write `requiredTools` only for a Template that has tools. The strict Markdown format keeps
them in the YAML frontmatter, and the generated `README.md` and `preview.html` list them. Nothing
about a tool is tagged or rewritten: links are exported and imported as written
([Required tools](required-tools.md)).

- Check: App copies, "exports them in a portable pack, and leaves the key out for a Template without
  them" and "keeps them through the Markdown and YAML template formats".

### Visibility defaults

If `isPublic` is present, an import preserves it by default. If it is missing, a Template imports
as private unless the importer overrides visibility ("Force public" or "Force private").

- Check: Import prep, "should set public status" and "should respect visibility override".

### Assets

JSON exports do not include R2 assets. If a Template references uploaded files (`image`, `video` or
`file` content with `uploadType: "upload"`), re-upload them after import: import copies asset URLs,
not the files, and warns about uploaded assets.

- Check: Backup parse, "should surface warnings for uploaded assets".

## Versioning and compatibility

Three versions serve different contracts. `templates.version` is the Template's edit counter, used
for save conflict checks (`expected_version`) and Activity numbers. Create, import and copy all
start it at `1` (a copy never inherits its source's counter; the source's `version` and
`content_version` go in the copy's audit event), and each save that changes a stored field advances
it. `templates.content_version` counts checklist structure changes, which Runs follow.

- Check: Clone API, "starts the copy at version 1, keeping the source counters only as
  provenance".

Backup exports use the root format version `1.0.0` and keep each Template's `version`.

- Check: Backup API, "should export backup format for pro users when requested".

Portable packs use `schemaVersion`. The current portable version is `2.1.0`, which added the
`form` block. Import accepts `2.0.0` and `2.1.0` (a `2.0.0` pack is valid `2.1.0` content), and
export writes `2.1.0`.

- Check: Portable import API, "rejects unsupported portable schema versions" and "imports a 2.1.0
  pack with a form, giving its fields ids and storing no answers".

When a format changes, import accepts and migrates the supported older versions, portable exports
stay on the latest version, and a D1 migration is added if stored Template content also changes.
The portable pack version is not the D1 storage version.

## Storage strategy (D1)

How D1 stores a Template's content, checks it on every write, and keeps its ids stable is in
[Template storage](template-storage.md#storage-strategy-d1).
