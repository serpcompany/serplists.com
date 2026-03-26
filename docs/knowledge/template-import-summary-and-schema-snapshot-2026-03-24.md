# Template import summary and schema snapshot policy (2026-03-24)

## Decisions locked

- `db/schema.sql` stays in the repo as a maintained snapshot for reference and local inspection.
- `db/migrations/*.sql` remains the only source of truth for schema changes.
- `/api/templates/backup` import responses now return structured per-template results instead of only a top-level imported count plus loose failures.

## Import summary shape

Successful imports now return:

- `total`
- `imported`
- `successes[]`
- `failed[]`

Each success includes:

- `index`
- `title`
- `id`
- `slug`
- `visibility`

Each failure includes:

- `index`
- `title`
- `reason`
- `code`

Current failure codes:

- `invalid_sections`
- `oversized_asset`
- `insert_failed`

If every template fails, the API still returns `400`, but now uses:

- `code = template_import_failed`
- `details = <full summary>`

That preserves the full per-template failure list for debugging instead of dropping everything except the first error.

## UI behavior

- The import card now keeps a `Last Import Result` summary after import.
- Mixed-result imports show both the imported templates and the failed templates with reasons.
- The success/error toast now uses `imported/total` counts instead of only the imported count.
