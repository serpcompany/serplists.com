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
  - Each table is a camelCase export that takes its SQL name as the first argument:
    `export const checklistRuns = sqliteTable("checklist_runs", { ... })`. Columns are
    property keys named as in SQL (`user_id: text("user_id")`), so code reads
    `checklistRuns.user_id`.
  - Renaming an export changes no SQL. ESLint's naming convention
    ([repository checks](../RELIABILITY.md#repository-checks)) refuses a snake_case export.
- `db/migrations/` owns the ordered D1 migration history; D1 records applied
  migrations in `d1_migrations`.
- SQL-only objects Drizzle cannot represent (currently the sitemap and
  [public handle](#public-handle-registry) triggers) are recorded in `db/sql-only-schema.json`.
- `db/seeds/` holds seed data and `db/maintenance/` one-off operations. Never put
  seed data in migrations; a data migration that must ship with deploy history
  must be idempotent, numbered, and clearly named.
- `db/schema.sql` is a reference snapshot only.

After changing either contract, run `pnpm run check:db:drizzle-parity` (CI runs it
too). It replays every migration into a temporary local database, generates the
Drizzle baseline into a second one, and compares their catalogs. It never touches
staging or production. D1 refuses a compound SELECT of more than five terms ("too many
terms in compound SELECT"), so the check reads each catalog in `UNION ALL` queries of at
most five SELECTs, and `d1:profile` counts its tables with one scalar subquery each.
Trigger definitions are compared, and recorded in `db/sql-only-schema.json`,
with quotes, backticks and runs of whitespace dropped, so a formatting change is not
drift; the remote schema check below normalizes them the same way.

`db/drizzle.config.ts` configures Drizzle Kit, which generates migrations without
Cloudflare credentials; Wrangler is the only migration executor. The historical
migrations lack Drizzle snapshot metadata, so `pnpm run db:generate` currently
proposes a fresh baseline migration: do not apply or commit it (TD-14).

### Writing a migration

D1 is SQLite, whose `ALTER TABLE` adds a column but cannot make the new column `UNIQUE` or
change a column's `NOT NULL` or default:

- For a unique column, add the column, then a unique index on it, as the second `0002`
  migration did for `users.username`.
- To change a column, rebuild the table: create `<table>_new`, copy every row, drop the old
  table, rename the new one and recreate its indexes, as `0014` to `0016` did for `users`. A
  rebuild names every column the table can hold on any database it runs on: `0016` redid
  `0014` and `0015` in one rebuild that keeps every column `0001` to `0015` gave `users`, the
  unused affiliate columns included.
- Write no `BEGIN` or `COMMIT`: remote D1 rejects transaction statements in a migration.
- D1 runs each migration in a transaction with foreign keys enforced, where
  `PRAGMA foreign_keys=OFF` changes nothing, so the one in `0014` to `0016` is not a pattern
  to copy. `PRAGMA defer_foreign_keys = on` defers the checks to the end of the migration but
  still runs `ON DELETE CASCADE` ([D1 docs](../references/cloudflare-d1-llms.txt)). Dropping
  a table that other tables reference deletes its rows first, with those `ON DELETE` actions,
  so find out what a rebuild's `DROP TABLE` would cascade to before it runs on staging or
  production.

Why the existing migrations did what they did is in
[data persistence](data-persistence.md#schema-history).

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

Every remote command (the staging and production scripts, and any `wrangler d1 ... --remote`)
acts on the Cloudflare account Wrangler is signed in to. When your login spans several
accounts, set `CLOUDFLARE_ACCOUNT_ID` to SERP's account first; otherwise Wrangler asks which
account to use, or stops with an error where it cannot ask. The ID is not written in this
repository: take it from the team's password manager, or ask a maintainer.

```bash
export CLOUDFLARE_ACCOUNT_ID=<SERP account ID>      # PowerShell: $env:CLOUDFLARE_ACCOUNT_ID = "<SERP account ID>"
pnpm run verify:prod:d1
```

`verify:staging` and `verify:prod:d1` are non-destructive: they check bindings,
list migration state, and detect schema drift without applying anything. If
`check:prod:d1-schema` fails, production is missing tables, columns, named indexes
or SQL-only triggers the deployed API needs; apply pending migrations before
shipping the frontend. The check requires every Drizzle table, column and named
index (`REQUIRED_D1_*` in `scripts/check-production-d1-schema-lib.ts`, which a
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
script resolves the target the way Wrangler does, since a baseline writes ledger rows
that mark migrations as applied: Wrangler matches the name against both `database_name`
and `binding` in the top-level `[[d1_databases]]`, and uses `preview_database_id` only
with `--preview`. So `DB` and `serp-checklists-db` both mean production unless
`--preview` is set, and `--database DB` without `--preview` is refused. `--database`
takes precedence over `D1_DATABASE_NAME`. `--allow-production` is refused for anything that does not
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
  The `d1:profile` synthetic data (`scripts/d1-profile-dataset.ts`) follows the same
  rule, checked by `tests/unit/scripts/d1-profile-dataset.test.ts`.
  `db/seeds/local.ts` is the module the seed scripts and tests import. The test data it
  writes lives in `db/seeds/local-test-data/`, one module per kind of row (people,
  Organizations, Templates, Runs, then activity and history), which `seedLocalTestData`
  inserts in that order with one clock, after `cleanup.ts` there deletes the old rows.
  The seed stages are listed once in `scripts/lib/local-d1-seed.ts`.
  `readLocalSeedStatus` (`db/seeds/local.ts`) marks each stage complete by the row
  it writes last, so `pnpm run setup` seeds only the stages that are missing
  (`tests/integration/setup-local-seed.test.ts`). seedLocalTestData runs without a
  transaction, so if it gains a later insert, move the completion marker to it:
  `tests/unit/db/seeds/local.test.ts` fails until the marker is the last row it inserts.
  When a seed change renames a slug that an
  existing local database still holds, add a local-only stage that fixes it in place
  (like `repair-test-slugs`, which gives test Templates seeded with official slugs
  their `sample-` slugs): setup never reruns seed-test on existing data, and
  `db/seeds/official-templates.sql` also runs against staging and production. The
  official login needs the `serp` User that the official Template seed writes, so setup
  seeds it again whenever that seed runs.
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
  they never collide with official ones. The `serp` User it writes has a random password
  hash whose password nobody holds, so no one can sign in as it on staging or production;
  locally, `seed-official-login` gives it the dev password.
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

## Checking stored checklist content

Saves check section content against `src/lib/schemas/storedSections.ts`, but rows
written before that check can still hold malformed content. The app and API make it
safe when they read or copy it, and saving the Run or Template through the app rewrites
it in the checked shape. To review what is stored,
`db/maintenance/find-malformed-checklist-content.sql` lists each malformed path in
`templates.items` and `checklist_runs.items`: a list that is not an array, text that is
not text, a flag that is not true or false, a content block with an unknown or missing
type, or a list entry that is not an object. It is read-only but scans every row of both
tables (D1 bills rows scanned), so run it deliberately, and any repair write against
staging or production goes to a human first:

```bash
npx wrangler d1 execute serp-checklists-db --remote --file=./db/maintenance/find-malformed-checklist-content.sql
```

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

## Public handle registry

`public_handles` (`0028`) gives Users and Organizations one namespace of public handles
(issue #233): one row per username and Organization slug, keyed on `lower(trim(value))`, with
its owner (`user` or `team`, and the id).

- **Triggers keep it.** Six triggers on `users` and `teams` claim a handle when a row gets a
  value, move it when the value changes (a change of case keeps it), and free it when the value
  is cleared or the row is deleted. Archiving an Organization changes no slug, so an archived
  Organization keeps its handle.
- **A taken handle fails the write itself.** A value another owner holds, in any case, fails
  with `UNIQUE constraint failed: public_handles.handle`, which rolls back that statement and its
  whole batch. The API answers it as it answers the per-table unique indexes:
  `422 USERNAME_IS_ALREADY_TAKEN` for a username, `409 team_slug_exists` for an Organization
  slug. Organization slug checks (`isTeamSlugTaken`) read the registry, so a slug derived from
  a name avoids usernames too.
- **Why triggers.** Better Auth writes usernames itself, and D1 has batches, not interactive
  transactions, so a claim made in a handler could not be atomic with that write.
- **The rule.** Usernames (Better Auth's `usernameValidator`), Organization slugs and the
  sitemaps follow `src/lib/schemas/publicHandle.ts`: 3 to 30 letters, digits, `_`, `.` and `-`.
  Its `normalizePublicHandle` produces the triggers' key. Values saved before the rule are
  registered as they are. `0029` gave the sitemap's user triggers the same characters.
- **Lookups.** A Public Profile (`/profile/:handle/`) reads the registry by its primary key with
  `normalizePublicHandle` (`GET /api/profiles/by-handle`, `findPublicProfileOwner` in
  `functions/api/utils/public-profile-owner.ts`), so a handle names one Profile Owner and is
  never tried as a User first and an Organization second. An archived Organization's row
  stays, but the lookup answers 404 for it ([Organizations](organizations.md#public-profile)).

Rollout, one database at a time:

1. `pnpm run check:public-handles:staging` (read-only; `check:public-handles:local` for local
   D1) lists collisions and values outside the rule. `0028`'s backfill stops on a collision, so
   rename each one by hand first; nothing is renamed automatically.
2. Back up ([below](#backup-and-restore)). Staging, whose database `--env preview` names:

   ```bash
   npx wrangler d1 export serp-checklists-staging-db --remote --env preview --output ./tmp/backups/serp-checklists-staging-db-$(date +%F).sql
   ```

3. `pnpm run db:migrate:d1:staging`, then `pnpm run check:staging:d1-schema`, which requires the
   table, its index and the six triggers.

Production waits for the owner's go-ahead on each step.

Rollback: the change is additive. To remove it, ship code that no longer reads the table, then a
new migration that drops the six triggers before `public_handles`; never edit `0028`.

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
enforces a per-bucket type list and size limit (`functions/api/handlers/uploads.ts`,
limits in `src/lib/schemas/uploadLimits.ts`) and writes keys under per-user prefixes:

- `avatars/<userId>/<uuid>.<ext>`
- `template-images/<userId>/<uuid>.<ext>`
- `template-videos/<userId>/<uuid>.<ext>`
- `template-files/<userId>/<uuid>.<ext>`

The type list lives in `src/lib/schemas/uploadTypes.ts`, which the API and the
upload pickers share (the pickers' `accept` and checks come from it). A file is
accepted by its type, including the aliases browsers report (Windows sends `.zip`
as `application/x-zip-compressed`), or, when the browser sends no type or the
generic `application/octet-stream`, by its extension, and is then stored under the
kind's usual type. Files take PDF, ZIP, CSV, Word, Excel, PowerPoint (including the
older `.doc`, `.xls`, `.ppt`), JSON, Markdown, text, and images; videos take MP4,
WebM, and MOV; images and avatars take PNG, JPEG, WebP, and GIF. A refused file gets
415 `unsupported_file_type` with a message that names the accepted types. Avatars
take at most 5MB and Template images, videos and files 50MB; the upload forms check
the same limits.

Before an Image block upload, the browser shrinks the image
(`src/lib/imageOptimization.ts`) without changing what it shows: GIFs are sent
untouched (a canvas keeps one frame), PNG and WebP stay PNG and WebP (JPEG has no
transparency), other decodable types become PNG, a small image within 1920x1080 is
sent as it is, and the original is kept when re-encoding does not make it smaller.
Files attached to File blocks are never re-encoded.

Before an avatar upload, the browser always redraws the image as a small square
(`prepareAvatarImage` in `src/lib/imageOptimization.ts`):
- it crops the centred square, which is what the round avatar shows;
- it scales it to at most 512 by 512 pixels (`AVATAR_MAX_PIXELS`), never enlarging a
  smaller one;
- it encodes it as WebP (PNG in a browser without WebP encoding) under the name
  `avatar.webp`.

Avatars show at 24 to 128 pixels, so a phone photo of several megabytes becomes tens of
kilobytes and loads at once. That also means the 5MB limit applies to what is sent, so
a larger photo is shrunk rather than refused. An animated GIF becomes a still image.

Uploads are not reference-counted and record no Personal or Organization owner. A
template upload's URL is copied into the saved template, its `template_versions`
snapshots, every run started from it, and duplicates and clones, so deleting the
object breaks all of them. `DELETE /api/uploads/file` therefore deletes only an
account's own avatar (`avatars/<userId>/<file>`) and refuses template-bucket keys
with 403 `asset_referenced`; the template editor never deletes uploads when a file
is cleared or replaced, it only unlinks them (TD-19). Unreferenced template uploads
accumulate until a reference-checked cleanup exists (TD-20).

Do not add expiration rules yet; they would break templates and avatars. The safe
baseline aborts incomplete multipart uploads:

```bash
npx wrangler r2 bucket lifecycle list serp-checklists-uploads
npx wrangler r2 bucket lifecycle add serp-checklists-uploads abort-incomplete-mpu --abort-multipart-days 7 --force
```

Once reference tracking exists, manage prefix expiration rules as code with
`npx wrangler r2 bucket lifecycle set serp-checklists-uploads --file <rules.json> --force`.
