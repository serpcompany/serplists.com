# Operations

## Build and deploy (Cloudflare Pages)
```bash
pnpm run build
npx wrangler pages deploy ./dist
```

## Secrets and environment
Set these in Cloudflare Pages (production) or `.dev.vars` (local):
- `JWT_SECRET` (required for auth)
- `R2_PUBLIC_BASE_URL` (optional; used to generate public file URLs)
- `FRONTEND_URL` (optional; when set, used as a CORS allowlist origin)
- `CORS_ALLOWED_ORIGINS` (optional; comma-separated CORS allowlist origins)

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

## R2 uploads
The R2 binding is configured in `wrangler.toml`:
- Binding: `R2_UPLOADS`
- Bucket name: `serp-checklists-uploads`

Uploads are handled by `POST /api/uploads` and stored under per-user prefixes.

Uploads enforce a per-bucket MIME allowlist (see `functions/api/handlers/uploads.ts`).
