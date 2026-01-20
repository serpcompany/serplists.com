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

`FRONTEND_URL` is only used by the legacy Hono worker in `src/api/` and is not required for the Pages Functions router.

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

## R2 uploads
The R2 binding is configured in `wrangler.toml`:
- Binding: `R2_UPLOADS`
- Bucket name: `serp-checklists-uploads`

Uploads are handled by `POST /api/uploads` and stored under per-user prefixes.
