# Portable template metadata persistence (2026-03-24)

Portable template imports were successfully creating template rows, but some metadata was being dropped in the app pipeline:

- `seoTitle`
- `seoDescription`
- `rules`

## What was wrong

- Client-side portable import normalization kept title/description/sections, but dropped SEO metadata and `rules`.
- Portable export omitted SEO metadata and `rules`, so round-trips were lossy.
- Template storage had SEO columns, but no `templates.rules` column, so `rules` could not persist through save/reload.
- The API import/export handlers accepted `rules` on portable payloads, but did not store or re-emit them.

## What changed

- Added `rules` to the template schema/type contract.
- Added D1 migration `0020_add_template_rules.sql`.
- Wired `rules`, `seoTitle`, and `seoDescription` through:
  - portable import preview normalization
  - template create/update payload validation
  - template import/export handlers
  - DB row parsing
  - repo-template copy payloads

## Verification used

- `pnpm exec vitest run tests/unit/lib/utils/templatePortable.test.ts tests/unit/lib/utils/templateBackup.test.ts tests/unit/functions/api/templates-portable-handler.test.ts tests/unit/functions/api/templates-handler.test.ts`
- `pnpm run typecheck`

## Remaining note

- This change preserves and reloads rule payloads, but it does not execute rule logic or surface rule failures in the UI yet.
