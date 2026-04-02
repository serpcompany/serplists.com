# Checklist Template JSON Schema

This document describes the JSON format used for template export/import and the content structures stored in D1. Source of truth: `src/lib/schemas/checklistSchema.ts`.

## Storage strategy (D1)
- `templates.items` stores the full sections JSON today's UI uses (array of sections with nested items/contents).
- `checklist_runs.items` stores the same sections JSON with completion state.
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

## Practical authoring workflow

The portable JSON pack is the canonical authoring format for template work outside the editor UI.

Current proven workflow:

1. Create or edit a portable JSON pack in VS Code.
2. Optionally generate a Markdown preview for human review.
3. Import the JSON through the template backup/import backend.
4. Verify the imported template on the public site.

This has now been verified end-to-end against the real site for the official `serp` publisher account.

Recommended local file shape:

```text
tmp/local-templates/{template-slug}/
  template.json
  README.md
```

Recommended usage:

- `template.json` is canonical
- `README.md` is a generated preview, not source of truth

Example live-tested payload:

- [camping-checklist.json](/Users/devin/dev/repos/serplists.com/docs/schema/camping-checklist.json)

Live-tested authoring examples created in this repo:

- [template.json](/Users/devin/dev/repos/serplists.com/tmp/local-templates/campsite-breakdown-checklist/template.json)
- [README.md](/Users/devin/dev/repos/serplists.com/tmp/local-templates/campsite-breakdown-checklist/README.md)

Current live import note:

- The portable import backend works for public templates.
- The current Templates UI can still block the file picker if `billingEnabled` is false, even when the signed-in user is already `pro`.
- If that happens, import can still be performed by posting the same portable JSON pack to `POST /api/templates/backup` with an authenticated Pro session.

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

Minimal template fields:
- `title` (required)
- `sections` **or** legacy `items` (required; JSON array, can be a stringified array)
- Optional: `description`, `categories`/`category`, `tags`, `isPublic`, `slug`, `seoTitle`, `seoDescription`, `rules`

Missing fields are auto-filled during import (ids, timestamps, userId).

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
