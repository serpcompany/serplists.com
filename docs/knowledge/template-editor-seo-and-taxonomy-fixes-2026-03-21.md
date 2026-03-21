# Template editor SEO and taxonomy fixes (2026-03-21)

## What broke
- The category field in `TemplateBasicInfo.tsx` was wrapped in `PopoverTrigger asChild`, which caused the rendered element to become `type="button"` instead of a real text input. Keyboard entry looked available but could not actually type.
- The template editor save path started sending `slug: ""` when the SEO slug field was left blank. The API correctly rejected that with Zod's `min(1)` validation.
- Template SEO metadata existed in `src/types/checklist.ts`, but it was not persisted through the API or D1 schema, and editor reloads did not map `slug` back into `seoUrl`.

## What changed
- Added `templates.seo_title` and `templates.seo_description` to D1 and the release schema gate.
- Wired `seoTitle`, `seoDescription`, and `slug` through template create/update/get paths.
- Mapped stored `slug` back into the editor's `Custom URL Slug` field.
- Switched the category autocomplete to use `PopoverAnchor` so the field stays a real input.
- Switched tag add-on-enter handling from `onKeyPress` to `onKeyDown`.
- Omit empty slugs from create/update requests instead of sending `""`.

## Verification
- Unit: API payload/handler tests pass for SEO save/load/update.
- Browser: template editor can now add a tag and category, save, reload, and keep both the taxonomy values and the SEO fields.

