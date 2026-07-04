# Operations

## Build and deploy (Cloudflare Pages)
```bash
pnpm run build
npx wrangler pages deploy ./dist
```

## One-command release verification
Run this before deploying (or immediately after a hotfix):
```bash
pnpm run verify:release
```
This runs lint, typecheck, unit/integration tests, and Playwright smoke checks.

Remote D1 readiness is separate because it needs Cloudflare credentials:

```bash
pnpm run verify:staging
pnpm run verify:prod:d1
```

### CI and automated deploy (GitHub Actions)
`ci.yml` runs on pull requests and pushes to `main` or `staging`:

- frozen install
- env contract validation
- lint
- typecheck
- unit/integration tests
- build
- Playwright Chromium install
- smoke tests

`cloudflare-pages-deploy.yml` runs on pushes to `main` or `staging`:

- validates env
- verifies production D1 readiness with `pnpm run verify:prod:d1` for `main`
- verifies preview/staging D1 readiness with `pnpm run verify:staging` for non-main branches
- builds with `pnpm run build`
- deploys `dist` to Cloudflare Pages with the current branch name

Preview deployments use the D1 `preview_database_id`. Production deployments use the production D1 database id.

Required GitHub secrets:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`
- `CLOUDFLARE_PAGES_PROJECT`

## Secrets and environment
Set these in Cloudflare Pages (production) or `.dev.vars` (local):
- `BETTER_AUTH_SECRET` (required for auth; 32+ chars)
- `STRIPE_SECRET_KEY` (required for paid/Pro)
- `STRIPE_WEBHOOK_SECRET` (required for paid/Pro)
- `STRIPE_PRO_PRICE_ID` (required for paid/Pro)
- `ENTITLEMENTS_ADMIN_SECRET` (optional; enables `/api/admin/entitlements/override`)
- `RESEND_API_KEY` or `USESEND_API_KEY` (at least one required for password reset + email verification emails)
- `EMAIL_FROM` (optional sender override for auth emails; defaults to `noreply@mail.auth.serp.co`)
- `R2_PUBLIC_BASE_URL` (optional; used to generate public file URLs)
- `FRONTEND_URL` (optional; when set, used as a CORS allowlist origin)
- `CORS_ALLOWED_ORIGINS` (optional; comma-separated CORS allowlist origins)

Local env policy:
- Use `.dev.vars` as the single local env source.
- `.env` and `.env.local` are deprecated and should not contain active values.

## Billing (Stripe)
- Webhook URL: `https://serplists.com/api/stripe/webhook`
- Billing endpoints (authenticated):
  - `POST /api/billing/checkout` (returns `{ url }` for Stripe Checkout)
  - `POST /api/billing/portal` (returns `{ url }` for Customer Portal)
  - `GET /api/billing/status` (returns `{ plan, billingEnabled }`)

## Logs
MVP assumes Cloudflare runtime logs only (no external sink/alerts). View request logs in the Cloudflare dashboard for the Pages project (and locally in `pnpm run dev:api` output).

## Incident response
See `docs/knowledge/incident-response-runbook.md`.

## D1 database
See [Database environments](database-environments.md) for the local/staging/production model.

The binding name is always `DB`.

- Local/prod database name: `serp-checklists-db`
- Staging/preview database name: `serp-checklists-staging-db`
- Production database UUID in `wrangler.toml`: `b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1`
- Staging preview database UUID in `wrangler.toml`: `fcaf4325-5be7-4ead-ab60-45932a04177b`

Use Wrangler D1 migrations instead of ad hoc remote `wrangler d1 execute` commands for schema changes:

```bash
pnpm run db:reset
pnpm run db:migrations:list:local
pnpm run db:migrate:d1:local
pnpm run db:migrations:list:staging
pnpm run db:migrate:d1:staging
pnpm run db:seed:official:staging
pnpm run db:migrations:list:prod
pnpm run db:migrate:d1:prod
```

If a remote DB predates native D1 migration tracking, baseline its existing
history before applying new migrations:

```bash
pnpm run db:migrations:baseline:prod -- --through 0020
pnpm run db:migrations:baseline:prod -- --through 0020 --execute
```

Preview deployments should not be enabled against production data. Create
`serp-checklists-staging-db`, paste its UUID into `preview_database_id` in
`wrangler.toml`, then run:

```bash
pnpm run check:preview:d1-binding
pnpm run verify:staging
pnpm run db:migrate:d1:staging
pnpm run check:staging:d1-schema
```

Drizzle Kit config lives at `db/drizzle.config.ts` and expects these env vars:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_DATABASE_ID`
- `CLOUDFLARE_D1_TOKEN`

```bash
pnpm run db:generate
pnpm run db:migrate
```

Production schema gate:
```bash
pnpm run verify:prod:d1
pnpm run check:prod:d1-schema
```

If this fails, production D1 is missing one or more required tables/columns for the deployed API. Apply pending D1 migrations before shipping the frontend deploy.

### D1 backup and restore
**Backups (recommended):** use `wrangler d1 export` to generate a `.sql` file containing schema + data.

Remote (production/staging):
```bash
mkdir -p ./tmp/backups
npx wrangler d1 export serp-checklists-db --remote --output ./tmp/backups/serp-checklists-db-$(date +%F).sql
```

Local (Miniflare DB used by `wrangler pages dev`):
```bash
mkdir -p ./tmp/backups
npx wrangler d1 export serp-checklists-db --local --output ./tmp/backups/serp-checklists-db-local-$(date +%F).sql
```

**Remote restore (fastest):** use D1 Time Travel (last ~30 days):
```bash
# Find a bookmark for a point-in-time
npx wrangler d1 time-travel info serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z

# Restore to that point-in-time
npx wrangler d1 time-travel restore serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z
```

**Restore from a `.sql` backup (disaster recovery):** create a new D1 DB, then execute the export file against it.
```bash
# Create a fresh DB and update `wrangler.toml` binding/id accordingly
npx wrangler d1 create serp-checklists-db-restored

# Ingest backup SQL
npx wrangler d1 execute serp-checklists-db-restored --remote --file=./tmp/backups/serp-checklists-db-YYYY-MM-DD.sql
```

## R2 uploads
The R2 binding is configured in `wrangler.toml`:
- Binding: `R2_UPLOADS`
- Bucket name: `serp-checklists-uploads`

Uploads are handled by `POST /api/uploads` and stored under per-user prefixes.

Uploads enforce a per-bucket MIME allowlist (see `functions/api/handlers/uploads.ts`).

### R2 lifecycle policies
Uploads are stored under these prefixes:
- `avatars/<userId>/...`
- `template-images/<userId>/...`
- `template-videos/<userId>/...`
- `template-files/<userId>/...`

**Recommended MVP policy:** do not auto-expire objects yet (uploads are not reference-counted, so expiration can break templates/avatars). The safe baseline is to abort incomplete multipart uploads.

```bash
# Inspect current lifecycle rules
npx wrangler r2 bucket lifecycle list serp-checklists-uploads

# Safe baseline: abort incomplete multipart uploads after 7 days
npx wrangler r2 bucket lifecycle add serp-checklists-uploads abort-incomplete-mpu --abort-multipart-days 7 --force
```

If/when you add reference tracking + cleanup, you can add expiration rules by prefix (or set them from JSON):
```bash
npx wrangler r2 bucket lifecycle set serp-checklists-uploads --file ./tmp/r2-lifecycle.json --force
```
