# Operations

## Build and deploy (Cloudflare Pages)
```bash
pnpm run build
npx wrangler pages deploy ./dist
```

### Automated deploy (GitHub Actions)
Pushes/merges to `main` trigger `cloudflare-pages-deploy.yml`, which builds with `pnpm run build` and deploys `dist` to Cloudflare Pages.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT`

## Secrets and environment
Set these in Cloudflare Pages (production) or `.dev.vars` (local):
- `BETTER_AUTH_SECRET` (required for auth; 32+ chars)
- `STRIPE_SECRET_KEY` (required for paid/Pro)
- `STRIPE_WEBHOOK_SECRET` (required for paid/Pro)
- `STRIPE_PRO_PRICE_ID` (required for paid/Pro)
- `ENTITLEMENTS_ADMIN_SECRET` (optional; enables `/api/admin/entitlements/override`)
- `RESEND_API_KEY` (required for forgot-password emails)
- `EMAIL_FROM` (required for forgot-password emails, e.g. `SERP Lists <support@serplists.com>`)
- `R2_PUBLIC_BASE_URL` (optional; used to generate public file URLs)
- `FRONTEND_URL` (optional; when set, used as a CORS allowlist origin)
- `CORS_ALLOWED_ORIGINS` (optional; comma-separated CORS allowlist origins)

## Billing (Stripe)
- Webhook URL: `https://serplists.com/api/stripe/webhook`
- Billing endpoints (authenticated):
  - `POST /api/billing/checkout` (returns `{ url }` for Stripe Checkout)
  - `POST /api/billing/portal` (returns `{ url }` for Customer Portal)
  - `GET /api/billing/status` (returns `{ plan }`)

## Logs
MVP assumes Cloudflare runtime logs only (no external sink/alerts). View request logs in the Cloudflare dashboard for the Pages project (and locally in `pnpm run dev:api` output).

## Incident response
See `docs/knowledge/incident-response-runbook.md`.

## D1 database
The database binding and name are defined in `wrangler.toml`:
- Binding: `DB`
- Database name: `serp-checklists-db`

Migrations live in `db/migrations/`. The repo uses `wrangler d1 execute` scripts rather than `wrangler d1 migrations`:
```bash
pnpm run db:reset
pnpm run db:seed
pnpm run db:backfill-slugs:remote
pnpm run db:migrate:progress:remote
```

Drizzle Kit config lives at `db/drizzle.config.ts` and expects these env vars:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_DATABASE_ID`
- `CLOUDFLARE_D1_TOKEN`

```bash
pnpm run db:generate
pnpm run db:migrate
```

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
