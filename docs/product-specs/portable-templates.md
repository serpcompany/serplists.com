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
- Section, item, and sub-item `id` values are stable identities. Renaming or reordering must retain them.
- `templates.content_version` advances only for checklist-structure changes. `checklist_runs.template_version` records the content version last applied; `revision` protects run writes from stale clients; `retired_items` preserves removed run state outside readiness calculations.
- Migration `0024` first normalizes legacy flat item arrays into the canonical `Checklist` section, then backfills deterministic path identities into template/run JSON and marks linked legacy runs stale (`template_version = 0`) because historical divergence cannot be inferred safely.
- `templates.category` and `templates.tags` store JSON arrays as text.
- `templates.seo_title` and `templates.seo_description` store template SEO metadata.
- Structured columns (`user_id`, `is_public`, `slug`, timestamps) remain relational for filtering and indexing.

## Portable template pack format

Portable export is the preferred JSON format for sharing, AI generation, repo storage, and future GitHub sync.

```ts
export const portableTemplatePackSchema = z.object({
  kind: z.literal("serplists-template-pack"),
  schemaVersion: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  templates: z.array(portableChecklistTemplateSchema),
  manifest: z.object({
    totalTemplates: z.number(),
    format: z.literal("portable").optional(),
    includesVisibility: z.boolean().optional(),
    includesRules: z.boolean().optional(),
    assetWarnings: z.number().optional(),
  }).optional(),
});
```

Portable template fields are intentionally cleaner than app row exports:
- no `userId`
- no created/updated timestamps
- visibility is represented as `visibility: "public" | "private"`
- optional SEO metadata is represented as `seoTitle` / `seoDescription`
- optional portable rules are represented as `rules`
- sections/items/content IDs may be present, but import should not depend on them

Portable round-trips must preserve `seoTitle`, `seoDescription`, and `rules`.
Rules are structurally stored and exported but are not executed or surfaced as
validation failures by the current runtime.

## Versioning and compatibility

Three versions serve different contracts:

- `templates.version` is the storage schema version for `templates.items`;
  its current value is `1`.
- Backup exports use root format version `1.0.0` and retain each template's
  storage version.
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
`invalid_sections`, `oversized_asset`, and `insert_failed`.

Mixed-result imports retain both lists. When every template fails, the API
returns `400` with `code: "template_import_failed"` and the full summary in
`details`, so clients must not discard all but the first failure.

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

A file that fails validation is rejected before anything is sent, with a
one-line reason that names up to three problems by 1-based position, for example
`Template validation failed: Section 1 > title: String must contain at least 1 character(s)`.
YAML syntax errors report their line (`Invalid YAML at line 3: ...`). The shared
formatter is `src/lib/schemas/formatValidationError.ts`.

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
- JSON and Markdown siblings named `template.json` and `template.md` can be checked for drift with `pnpm templates:check`

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

### Assets
JSON exports **do not** include R2 assets. If a template references uploaded files
(`image`/`video`/`file` contents with `uploadType: "upload"`), re-upload assets after import.

### Current import/export policy
- Template import/export is a **Pro** feature.
- Export defaults to the portable template pack format.
- Backup export is still available for compatibility.
- Guardrails are enforced (max 5 templates/import; block assets > 5MB).
- Asset uploads should be <= 5MB each (compress before publishing).
- For live public-library publishing today, the imported template should be owned by the intended public publisher account before import, because author username is resolved from DB ownership, not from the portable JSON file.

`seoUrl` is represented by the stored `slug` field and mapped back into the editor's `Custom URL Slug` input.

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

Supported types:
- `text` (markdown)
- `image`
- `video`
- `file`
- `embed` (URL or raw text)
- `subItems` (nested checklist)
