# D1 backup/restore + R2 lifecycle (Cloudflare)

This project uses:
- D1 database: `serp-checklists-db` (binding: `DB`)
- R2 bucket: `serp-checklists-uploads` (binding: `R2_UPLOADS`)

## D1 backups
Use `wrangler d1 export` to export schema + data into a `.sql` file.

```bash
mkdir -p ./tmp/backups

# Remote (production/staging)
npx wrangler d1 export serp-checklists-db --remote --output ./tmp/backups/serp-checklists-db-$(date +%F).sql

# Local (Miniflare DB used by `wrangler pages dev`)
npx wrangler d1 export serp-checklists-db --local --output ./tmp/backups/serp-checklists-db-local-$(date +%F).sql
```

## D1 restore
Preferred for remote restores (last ~30 days): D1 Time Travel.
```bash
npx wrangler d1 time-travel info serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z
npx wrangler d1 time-travel restore serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z
```

Disaster recovery from an export file: create a fresh D1 DB and execute the `.sql` file.
```bash
npx wrangler d1 create serp-checklists-db-restored
npx wrangler d1 execute serp-checklists-db-restored --remote --file=./tmp/backups/serp-checklists-db-YYYY-MM-DD.sql
```

## R2 lifecycle policies
R2 keys are written as:
- `avatars/<userId>/<uuid>.<ext>`
- `template-images/<userId>/<uuid>.<ext>`
- `template-videos/<userId>/<uuid>.<ext>`
- `template-files/<userId>/<uuid>.<ext>`

Recommended MVP baseline: **do not expire objects** yet (uploads are not reference-counted), but do abort incomplete multipart uploads.

```bash
# Inspect lifecycle rules
npx wrangler r2 bucket lifecycle list serp-checklists-uploads

# Abort incomplete multipart uploads after 7 days
npx wrangler r2 bucket lifecycle add serp-checklists-uploads abort-incomplete-mpu --abort-multipart-days 7 --force
```

If you want lifecycle rules managed as code:
```bash
npx wrangler r2 bucket lifecycle set serp-checklists-uploads --file ./tmp/r2-lifecycle.json --force
```
