# Operations

## Build and deploy (Cloudflare Pages)

Local production deployment is blocked. Use the protected GitHub workflow and
follow [Protected data promotion](protected-data-promotion.md). Local builds are
verification only and do not authorize a deploy.

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

`cloudflare-pages-deploy.yml` runs staging on pushes to `staging`. Production is
manual-dispatch only from the exact reviewed `main` commit:

- protected identity and recovery checks;
- exact CI and rehearsal evidence;
- migration, ledger, schema, and invariant gates before deploy;
- authenticated account-owned template/run and custom-domain checks afterward;
- 90-day reports and rollback/roll-forward routing.

Preview deployments use the `[[env.preview.d1_databases]]` D1 binding, which
must match the top-level `preview_database_id`. Production deployments use the
production D1 database id.

Required protected-environment secrets:
- staging: `STAGING_CLOUDFLARE_API_TOKEN`, `STAGING_INVARIANT_HMAC_KEY`, `STAGING_DATA_CANARY_OWNER_ID`, `STAGING_DATA_CANARY_COOKIE`
- production: `PRODUCTION_CLOUDFLARE_API_TOKEN`, `PRODUCTION_BACKUP_ENCRYPTION_KEY`, `PRODUCTION_DATA_CANARY_OWNER_ID`, `PRODUCTION_DATA_CANARY_COOKIE`

Legacy global API-key credentials are rejected by the production executor.

Cloudflare Pages project:
- Project name: `serplists-com`
- Domains: `serp-checklists.pages.dev`, `serplists.com`, `staging.serplists.com`

The Pages project name is not secret and is set directly in `.github/workflows/cloudflare-pages-deploy.yml`. Do not use the `serp-checklists.pages.dev` domain or `wrangler.toml` `name` as the `wrangler pages deploy --project-name` value.

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
```

Production mutation commands intentionally exit non-zero outside the protected
workflow. Do not apply, baseline, seed, or clean production from a checkout.

If production ever requires migration-ledger repair, treat it as break glass and
obtain approval for the exact action through the incident procedure. The former
local production-baseline entrypoint is blocked.

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
pnpm run db:generate
```

`drizzle-kit migrate` is blocked because Wrangler numbered migrations are the
only D1 ledger. Production export and restore commands are executed only by the
protected workflow or an explicitly approved break-glass action; they are not
checkout runbook commands.

Production schema gate:
```bash
pnpm run verify:prod:d1
pnpm run check:prod:d1-schema
```

If this fails, production D1 is missing one or more required tables/columns for the deployed API. Apply pending D1 migrations before shipping the frontend deploy.

### D1 backup and restore

Production backup and restore are protected workflow or explicitly approved
break-glass actions. Never run a production export, Time Travel restore, import,
or replacement-database command from a checkout. The protected workflow writes
plaintext outside artifact directories, encrypts the recovery export, removes
plaintext on exit/cancellation, and uploads only the encrypted artifact.

Local (Miniflare DB used by `wrangler pages dev`):
```bash
mkdir -p ./tmp/backups
npx wrangler d1 export serp-checklists-db --local --output ./tmp/backups/serp-checklists-db-local-$(date +%F).sql
```

The exact restore target and recovery point require a fresh human approval and
a non-production restore rehearsal before any production action.

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
