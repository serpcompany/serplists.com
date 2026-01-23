# Template JSON versioning

We track a **template schema version** so we can safely migrate older exported/imported JSON formats over time.

## Current version
- `templates.version` (D1 column) stores the schema version for the JSON stored in `templates.items`.
- Current value: `1`

## Backup/export format
- Template exports include a root `version: "1.0.0"` (backup file format version) and each template includes `version` (schema version).
- Export/import is server-enforced (Pro-only) via `GET /api/templates/backup` and `POST /api/templates/backup`.

## How to evolve this
1. Add a migration to bump stored templates (and/or add a new version).
2. Update `POST /api/templates/backup` to accept older `version` values and migrate them to the latest shape before storing.
3. Keep exports writing the latest schema version so round-trips are stable.

