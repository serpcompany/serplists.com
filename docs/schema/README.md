# Checklist Template JSON Schema

This document describes the JSON format used for template export/import and the content structures stored in D1. Source of truth: `src/lib/schemas/checklistSchema.ts`.

## Storage strategy (D1)
- `templates.items` stores the full sections JSON today's UI uses (array of sections with nested items/contents).
- `checklist_runs.items` stores the same sections JSON with completion state.
- `templates.category` and `templates.tags` store JSON arrays as text.
- Structured columns (`user_id`, `is_public`, `slug`, timestamps) remain relational for filtering and indexing.

## Template backup format
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
```

## Import formats (lenient)
We accept either the full backup format above or a simple array of templates. Minimal template fields:
- `title` (required)
- `sections` **or** legacy `items` (required; JSON array, can be a stringified array)
- Optional: `description`, `categories`/`category`, `tags`, `isPublic`, `slug`

Missing fields are auto-filled during import (ids, timestamps, userId).

### Visibility defaults
- If `isPublic` is present, it is preserved by default.
- If missing, templates default to **private** unless the importer overrides visibility.

### Assets
JSON exports **do not** include R2 assets. If a template references uploaded files
(`image`/`video`/`file` contents with `uploadType: "upload"`), re-upload assets after import.

### MVP import policy (decision + current behavior)
- **Decision:** template import/export is a **Pro** feature (see `docs/knowledge/billing-entitlements.md`).
- **Current behavior:** guardrails are enforced (max 5 templates/import; block assets > 5MB), but plan-based gating is not implemented yet.
- Asset uploads should be <= 5MB each (compress before publishing).

Note: `src/types/checklist.ts` includes optional fields like `seoTitle`, `seoDescription`, and `seoUrl`, but they are not required by the Zod schema.

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
