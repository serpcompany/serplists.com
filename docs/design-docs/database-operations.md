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
`check:prod:d1-schema` fails, production is missing tables, columns, named indexes
or SQL-only triggers the deployed API needs; apply pending migrations before
shipping the frontend. The check requires every Drizzle table, column and named
index (`REQUIRED_D1_*` in `scripts/check-production-d1-schema-lib.mjs`, which a
unit test keeps equal to `db/schema/`) and every trigger in
`db/sql-only-schema.json`, on its table and with the recorded definition. Extra
columns, indexes and tables are allowed.

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

A remote baseline needs exactly one of `--preview` (staging, as
`db:migrations:baseline:staging` passes) or `--allow-production` (production). The
script resolves the target the way Wrangler does: `DB` and `serp-checklists-db`
both mean production unless `--preview` is set, so `--database DB` without
`--preview` is refused. `--allow-production` is refused for anything that does not
resolve to production, a name outside `wrangler.toml` is refused, and so is any
remote run while `CLOUDFLARE_ENV` is set. The dry run prints the resolved database
UUID.

Use `--through 0021` only if the legacy-named `teams`/audit migration was already
applied outside Wrangler. Never baseline past a migration whose objects are not
already in the database: baselining only records ledger rows, and
`check:prod:d1-schema` is what catches a gap. Fresh staging databases need no
baseline.

## Seeds

- Local: `pnpm run db:seed` (or `db:reset`, which also clears state) seeds test
  Users, Organization fixtures, invites, entitlement overrides, audit rows, and the
  official `serp` publisher with its Templates. Fixture ids keep legacy `team` names.
  Before seeding, and in `db:cleanup:local`, one atomic batch deletes the test
  Users and what they made while using the app: Organizations they created (with
  every Template, Run and invite in them), invites they sent and Template history
  they wrote in other Organizations. If any delete fails, nothing is deleted.
  A seeded Template's `version` must be at least its newest `template_versions`
  row: a save writes history row `version + 1`, so a lower value makes every save
  fail with a 409 edit conflict. `tests/integration/local-d1-fixtures.test.ts`
  checks this for every seeded Template and saves the seeded Organization Template.
  The seed stages are listed once in `scripts/lib/local-d1-seed.mjs`.
  `readLocalSeedStatus` (`db/seeds/local.ts`) marks each stage complete by the row
  it writes last, so `pnpm run setup` seeds only the stages that are missing
  (`tests/integration/setup-local-seed.test.ts`). If seedLocalTestData gains a later
  insert, move the completion marker to it.
- Staging: `pnpm run db:seed:official:staging` for official templates only, unless
  there is a deliberate test-data plan.
- Production: never seed test Users or Organization fixtures.
- Staging and production have no cleanup command. Deleting accounts or other data
  in a remote database is a manual operation a human approves ([AGENTS.md](../../AGENTS.md)).
  It has to resolve the `ON DELETE RESTRICT` references to `users` first:
  `teams.created_by_user_id`, `team_invites.invited_by_user_id` and
  `template_versions.changed_by_user_id`. It also has to target exact user ids,
  never an email pattern. `tests/unit/scripts/package-scripts.test.ts` fails if a
  package script runs a SQL file against a remote D1, other than the official
  Template seed.
- `db/seeds/official-templates.sql` skips rows whose id already exists, so reruns
  are safe. Any other conflict (another Template with an official slug, or another
  User with the `serp` email or username) fails with a UNIQUE constraint error
  instead of silently dropping the row. Test-seed Templates use `sample-` slugs so
  they never collide with official ones.
- The `items` JSON in that file sits inside SQL string literals, and SQLite does
  not process backslash escapes there. Write a line break as the JSON escape `\n`
  (one backslash), never `\\n`, which stores a literal backslash and `n`.
  `tests/unit/db/seeds/official-templates.test.ts` checks this. Because existing
  rows are skipped, fixing the file does not repair a database that was already
  seeded. Staging and production still hold the old text and need this data
  migration, which does not exist yet. Add it as the next free migration number
  after `0026`. A human approves applying it remotely:

  ```sql
  UPDATE templates SET items = replace(items, '\\n', '\n')
  WHERE user_id = 'serp-user'
    AND id IN ('serp-template-technical-seo-audit', 'serp-template-keyword-research-mapping',
               'serp-template-content-refresh', 'serp-template-local-seo-gbp',
               'serp-template-serp-features')
    AND instr(items, '\\n') > 0;
  ```

  SQLite reads `'\\n'` as three characters and `'\n'` as two, so the statement
  turns each double-escaped break into the JSON escape. The `instr` guard makes a
  second run change nothing. Run against the old seed, it updates 4 rows (one
  Template has no line breaks) and leaves them byte-identical to the fixed seed.
  Leave `content_version` alone, so Runs are not offered an update. The Drizzle
  schema does not change. Copies of these Templates and Runs started from them
  keep the old text, so the display normalizer for legacy backslash-n text stays
  until a human decides about that user data.

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
enforces a per-bucket MIME allowlist (`functions/api/handlers/uploads.ts`) and
writes keys under per-user prefixes:

- `avatars/<userId>/<uuid>.<ext>`
- `template-images/<userId>/<uuid>.<ext>`
- `template-videos/<userId>/<uuid>.<ext>`
- `template-files/<userId>/<uuid>.<ext>`

Uploads are not reference-counted, so do not add expiration rules yet; they would
break templates and avatars. The safe baseline aborts incomplete multipart uploads:

```bash
npx wrangler r2 bucket lifecycle list serp-checklists-uploads
npx wrangler r2 bucket lifecycle add serp-checklists-uploads abort-incomplete-mpu --abort-multipart-days 7 --force
```

Once reference tracking exists, manage prefix expiration rules as code with
`npx wrangler r2 bucket lifecycle set serp-checklists-uploads --file <rules.json> --force`.
