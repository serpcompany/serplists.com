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
- Stop further production mutations and record the exact commit, production
  database name/UUID, ledger, observed impact, and available recovery point in
  an incident issue.
- Prefer rolling back application code when that restores compatibility without
  mutating data. Choose restore or roll-forward in writing from observed
  invariant and ledger evidence.
- Before any production restore, rehearse the exact bookmark or encrypted export
  into a newly created isolated non-production database. Verify the restore,
  migration ledger, schema contract, privacy-safe invariants, and authenticated
  account-owned behavior there.
- A production restore may run only through a protected recovery executor, or
  through the database standard's break-glass process during active containment.
  It requires fresh independent human approval for the exact production name,
  UUID, commit, recovery point, and single restore action. Previous PR,
  deployment, or Environment approval is not reusable.
- The protected action must verify production identity immediately before and
  after the restore, rerun ledger/schema/invariant/authenticated checks, preserve
  reports, and stop on any mismatch. There is no direct production restore
  operator command in this runbook.

### R2 upload issues (uploads failing, assets 404)
- Confirm the R2 bucket binding exists (`R2_UPLOADS`) and bucket name matches `wrangler.toml`.
- Confirm the object key being requested exists (keys are the source of truth for public access via `/api/uploads/file?key=...`).
- If lifecycle expiration rules exist, they may be deleting objects unexpectedly.

## Read-only inspection commands
```bash
# D1: guarded identity and ledger inspection; neither command mutates production
node scripts/data/data-command.mjs identify --environment production
node scripts/data/data-command.mjs migration-ledger --environment production

# R2: inspect lifecycle rules
npx wrangler r2 bucket lifecycle list serp-checklists-uploads
```

Do not add `--execute`, call Wrangler restore/export directly, rebind production,
or substitute an ordinary workflow dispatch. Those are production mutations or
sensitive-data operations and require the exact protected authorization path in
the database standard.
