# Database Environments

SERP Lists uses Cloudflare D1 through the `DB` binding. Do not let preview
deployments share the production D1 database.

## Environment Model

- Local: Miniflare D1 state under `.wrangler/`, reset with `pnpm run db:reset`.
- Staging: remote D1 database named `serp-checklists-staging-db`, used by Pages preview deployments.
- Production: remote D1 database named `serp-checklists-db`, used only by production deployments.

## Source Of Truth

- Runtime schema/types: `db/schema/*.ts`.
- Applied database ledger: D1's `d1_migrations` table.
- Migration files: numbered SQL files in `db/migrations/`.
- Seed SQL: `db/seeds/`.
- Maintenance SQL: `db/maintenance/`.
- Snapshot reference only: `db/schema.sql`.

Do not put seed data into `db/migrations/`. If a data migration must run as part
of deploy history, make it idempotent, numbered, and name it clearly.

## Create Staging D1

```bash
npx wrangler d1 create serp-checklists-staging-db
```

Paste the returned database UUID into the `preview_database_id` field in
`wrangler.toml`. The current staging database UUID is already configured there.

Cloudflare Pages supports only `production` and `preview` environment overrides
in `wrangler.toml`, so this one staging database is the shared DB for all preview
deployments.

The Pages deploy workflow runs `pnpm run check:preview:d1-binding` for non-main
branches and will fail preview/staging deploys until `preview_database_id` is set
to a UUID that differs from production.

Staging DB commands intentionally target the `DB` binding with Wrangler's
`--preview` flag. Do not change them back to the staging database name directly;
that bypasses the preview binding configuration Wrangler uses for Pages preview
deployments.

## Apply Schema

Local:

```bash
pnpm run db:migrations:list:local
pnpm run db:migrate:d1:local
```

Staging:

```bash
pnpm run db:migrations:list:staging
pnpm run db:migrate:d1:staging
pnpm run db:seed:official:staging
pnpm run check:staging:d1-schema
```

Production:

```bash
pnpm run db:migrations:list:prod
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

Wrangler records applied migrations in `d1_migrations` and applies only pending
migrations.

## Non-Destructive Release Checks

Use these before promoting a branch. They verify bindings, list migration
state, and check schema drift without applying migrations.

Staging/preview:

```bash
pnpm run verify:staging
```

Production:

```bash
pnpm run verify:prod:d1
```

## One-Time Baseline For Existing Databases

If a remote DB already has schema changes that were applied with
`wrangler d1 execute`, it may not have D1 migration ledger rows yet. Do not run
`db:migrate:d1:*` against that DB until the existing schema history is
baselined.

Example for production that already has everything through `0020`:

```bash
pnpm run db:migrations:baseline:prod -- --through 0020
pnpm run db:migrations:baseline:prod -- --through 0020 --execute
pnpm run db:migrations:list:prod
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

Use `--through 0021` only if the teams/audit migration has already been applied
outside Wrangler migrations. Fresh staging databases do not need a baseline.

## Preview Deployment Checklist

1. Confirm `wrangler.toml` has a `preview_database_id` that differs from production.
2. Run `pnpm run verify:staging`.
3. Run `pnpm run db:migrate:d1:staging` only when pending migrations are expected.
4. Run `pnpm run check:staging:d1-schema`.
5. Deploy a preview branch and verify new data lands in staging, not production.

## Production Safety

- Back up production before production migrations:

```bash
npx wrangler d1 export serp-checklists-db --remote --output ./tmp/backups/serp-checklists-db-YYYY-MM-DD.sql
```

- Never use ad hoc `wrangler d1 execute serp-checklists-db --remote --file=...`
  for schema changes. Use `pnpm run db:migrate:d1:prod` so D1 records the migration.
- Keep preview and production Pages secrets separate in Cloudflare.
