# Incident response runbook (MVP)

MVP assumes “Cloudflare logs only” (no external alerting). This runbook is a quick checklist for when prod appears broken.

## Fast triage (5 minutes)
- Confirm whether the issue is frontend-only or API-only.
- Hit `GET /api/health` in the browser (or `curl`) to confirm Pages Functions are responding.
- Check Cloudflare dashboard runtime logs for the Pages project.
- Capture `X-Request-Id` values from failing responses (helps correlate logs).
- If the incident started right after a deploy: rollback to the previous Pages deployment first.

## Common failure modes
### Auth/session issues (login loops, 401s)
- Confirm requests are sending cookies (frontend should call API with `credentials: "include"`).
- Confirm CORS is allowing credentials and the correct origin (`FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`).
- If you rotated `BETTER_AUTH_SECRET`, existing sessions will be invalid; users must log in again.

### D1 issues (500s on templates/checklists)
- Check recent migration/deploy changes.
- If you need rapid recovery and the issue is within ~30 days: prefer D1 Time Travel restore.
- If recovering from a backup export: restore into a fresh DB and update `wrangler.toml` binding/id.

### R2 upload issues (uploads failing, assets 404)
- Confirm the R2 bucket binding exists (`R2_UPLOADS`) and bucket name matches `wrangler.toml`.
- Confirm the object key being requested exists (keys are the source of truth for public access via `/api/uploads/file?key=...`).
- If lifecycle expiration rules exist, they may be deleting objects unexpectedly.

## Useful commands (manual, as needed)
```bash
# D1: export a snapshot
npx wrangler d1 export serp-checklists-db --remote --output ./tmp/backups/serp-checklists-db-$(date +%F).sql

# D1: time travel restore (remote only; last ~30 days)
npx wrangler d1 time-travel restore serp-checklists-db --timestamp 2025-01-01T00:00:00.000Z

# R2: inspect lifecycle rules
npx wrangler r2 bucket lifecycle list serp-checklists-uploads
```

