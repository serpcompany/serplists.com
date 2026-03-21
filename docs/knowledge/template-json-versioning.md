# Template JSON versioning

We track a **template schema version** so we can safely migrate older exported/imported JSON formats over time.

## Current versions
- `templates.version` (D1 column) stores the schema version for the JSON stored in `templates.items`.
- Current storage value: `1`
- Portable template pack schema version: `2.0.0`

## Export/import formats
- Backup exports include a root `version: "1.0.0"` (backup file format version) and each template includes `version` (storage schema version).
- Portable exports use `kind: "serplists-template-pack"` plus `schemaVersion`.
- Export/import is server-enforced (Pro-only) via `GET /api/templates/backup` and `POST /api/templates/backup`.

## How to evolve this
1. Add a migration to bump stored templates (and/or add a new version).
2. Update `POST /api/templates/backup` to accept older backup or portable schema versions and migrate them to the latest accepted shape before storing.
3. Keep portable exports writing the latest portable schema version so repo and AI round-trips stay stable.
