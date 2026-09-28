# Database Operations

SERP Lists uses Cloudflare D1 through the `DB` binding and R2 through the
`R2_UPLOADS` binding. Preview deployments must never share the production database.

## Environments

| Environment | D1 database | UUID in `wrangler.toml` | Used by |
| --- | --- | --- | --- |
| Local | Miniflare state under `.wrangler/` | n/a | `pnpm run dev:*`, tests |
| Staging | `serp-checklists-staging-db` | `fcaf4325-5be7-4ead-ab60-45932a04177b` | Pages preview deployments (`staging` and other branches) |
| Production | `serp-checklists-db` | `b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1` | Production deployments (`main`) only |

Auth policy is explicit in `wrangler.toml`: local and preview set
`AUTH_EMAIL_VERIFICATION_REQUIRED=false`; production sets `true`. Never infer the
environment from the request hostname, because preview aliases and custom staging
domains must behave the same.

Cloudflare Pages supports only `production` and `preview` overrides, so one staging
database serves every preview deployment. Its UUID must be in both
`preview_database_id` (used by Wrangler `--preview` commands) and
`[[env.preview.d1_databases]].database_id` (used by Pages preview deployments).
`pnpm run check:preview:d1-binding` fails staging deploys unless both are set to
the same UUID and it differs from production. Staging commands target the `DB`
binding with `--preview`; do not change them to use the database name directly.

## Schema ownership

- `db/schema/` (Drizzle) owns every object Drizzle can represent: tables, columns,
  defaults, constraints, foreign keys, and indexes. The generated reference is
  [generated/db-schema.md](../generated/db-schema.md).
- `db/migrations/` owns the ordered D1 migration history; D1 records applied
  migrations in `d1_migrations`.
- SQL-only objects Drizzle cannot represent (currently the sitemap triggers) are
  recorded in `db/sql-only-schema.json`.
- `db/seeds/` holds seed data and `db/maintenance/` one-off operations. Never put
  seed data in migrations; a data migration that must ship with deploy history
  must be idempotent, numbered, and clearly named.
- `db/schema.sql` is a reference snapshot only.

After changing either contract, run `pnpm run check:db:drizzle-parity` (CI runs it
too). It replays every migration into a temporary local database, generates the
Drizzle baseline into a second one, and compares their catalogs. It never touches
staging or production.

`db/drizzle.config.ts` configures Drizzle Kit, which generates migrations without
Cloudflare credentials; Wrangler is the only migration executor. The historical
migrations lack Drizzle snapshot metadata, so `pnpm run db:generate` currently
proposes a fresh baseline migration: do not apply or commit it (TD-14).

## Applying migrations

```bash
# Local
pnpm run db:migrations:list:local
pnpm run db:migrate:d1:local

# Staging
pnpm run verify:staging
pnpm run db:migrate:d1:staging
pnpm run db:seed:official:staging
pnpm run check:staging:d1-schema

# Production (back up first; see below)
pnpm run verify:prod:d1
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

`verify:staging` and `verify:prod:d1` are non-destructive: they check bindings,
list migration state, and detect schema drift without applying anything. If
`check:prod:d1-schema` fails, production is missing tables or columns the deployed
API needs; apply pending migrations before shipping the frontend.

Never run `wrangler d1 execute ... --remote --file=...` for schema changes; use
`db:migrate:d1:*` so D1 records the migration.

### One-time baseline for older databases

A remote database changed with `wrangler d1 execute` may lack ledger rows. Baseline
it before applying new migrations (production example, through `0020`):

```bash
pnpm run db:migrations:baseline:prod -- --through 0020
pnpm run db:migrations:baseline:prod -- --through 0020 --execute
pnpm run db:migrations:list:prod
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

Use `--through 0021` only if the legacy-named `teams`/audit migration was already
applied outside Wrangler. Fresh staging databases need no baseline.

## Seeds

- Local: `pnpm run db:seed` (or `db:reset`, which also clears state) seeds test
  Users, Organization fixtures, invites, entitlement overrides, audit rows, and the
  official `serp` publisher with its Templates. Fixture ids keep legacy `team` names.
- Staging: `pnpm run db:seed:official:staging` for official templates only, unless
  there is a deliberate test-data plan.
- Production: never seed test Users or Organization fixtures.

## Checking stored checklist content

Saves check section content against `src/lib/schemas/storedSections.ts`, but rows
written before that check can still hold malformed content. The app and API make it
safe when they read or copy it. To review what is stored,
`db/maintenance/find-malformed-checklist-content.sql` lists each malformed path in
`templates.items` and `checklist_runs.items`. It is read-only but scans both tables,
and any repair write against staging or production goes to a human first.

## Release checklists

Preview/staging:

1. Confirm both preview D1 fields in `wrangler.toml` point at staging, not production.
2. Run `pnpm run verify:staging`.
3. Run `pnpm run db:migrate:d1:staging` only when migrations are pending.
4. Run `pnpm run check:staging:d1-schema`.
5. Deploy a preview branch and confirm new data lands in staging.
6. Exercise an Organization create, invite, and accept flow before promoting
   Organization-related changes.

Production:

- Back up before migrating (below).
- Keep preview and production Pages secrets separate.
- Run `pnpm run verify:prod:d1` before promoting `staging` to `main`.
- Confirm the Organization audit/history tables exist before deploying code that
  writes Organization or Template history.

## Backup and restore

```bash
mkdir -p ./tmp/backups
# Remote export (schema + data)
npx wrangler d1 export serp-checklists-db --remote --output ./tmp/backups/serp-checklists-db-$(date +%F).sql
# Local export
npx wrangler d1 export serp-checklists-db --local --output ./tmp/backups/serp-checklists-db-local-$(date +%F).sql
```

Restore within about 30 days with D1 Time Travel (fastest):

```bash
npx wrangler d1 time-travel info serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z
npx wrangler d1 time-travel restore serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z
```

Disaster recovery from an export: create a fresh database, point the binding at it
in `wrangler.toml`, and load the file.

```bash
npx wrangler d1 create serp-checklists-db-restored
npx wrangler d1 execute serp-checklists-db-restored --remote --file=./tmp/backups/serp-checklists-db-YYYY-MM-DD.sql
```

## R2 uploads

Bucket `serp-checklists-uploads` (binding `R2_UPLOADS`). `POST /api/uploads`
enforces a per-bucket MIME allowlist and size limit (`functions/api/handlers/uploads.ts`,
limits in `src/lib/schemas/uploadLimits.ts`) and writes keys under per-user prefixes:

- `avatars/<userId>/<uuid>.<ext>`
- `template-images/<userId>/<uuid>.<ext>`
- `template-videos/<userId>/<uuid>.<ext>`
- `template-files/<userId>/<uuid>.<ext>`

Uploads are not reference-counted and record no Personal or Organization owner,
so `DELETE /api/uploads/file` deletes only an account's own avatar; template media
is never deleted through the API, and clearing it in the editor only unlinks it
(TD-19). Do not add expiration rules yet; they would break templates and avatars. The safe baseline aborts incomplete multipart uploads:

```bash
npx wrangler r2 bucket lifecycle list serp-checklists-uploads
npx wrangler r2 bucket lifecycle add serp-checklists-uploads abort-incomplete-mpu --abort-multipart-days 7 --force
```

Once reference tracking exists, manage prefix expiration rules as code with
`npx wrangler r2 bucket lifecycle set serp-checklists-uploads --file <rules.json> --force`.
