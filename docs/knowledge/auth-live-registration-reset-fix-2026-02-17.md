# Live Auth Fix: Registration + Password Reset (2026-02-17)

## What was broken
- Live registration previously failed due `users.password_hash` being `NOT NULL` while Better Auth writes `NULL` for that legacy column.
- Password reset and verification could appear successful even when email delivery provider config was missing.

## What was changed
- Applied live-safe D1 migration: `db/migrations/0016_users_password_hash_nullable_live_safe.sql`.
- Added email provider fallback in `functions/api/better-auth.ts`:
  - Use `RESEND_API_KEY` when present.
  - Fallback to `USESEND_API_KEY` when Resend is not set.
  - Throw explicit error if neither provider key is configured.
- Changed auth email callbacks to `await` delivery to avoid silent background failures.
- Added `USESEND_API_KEY` to env typing/validation:
  - `functions/api/types.ts`
  - `functions/api/env.ts`
  - `scripts/check-env.mjs`
- Updated docs + `.dev.vars.example` for dual-provider auth email config.

## Production configuration applied
- Added Cloudflare Pages secrets for project `serp-checklists`:
  - `USESEND_API_KEY`
  - `EMAIL_FROM`

## Verification run
- API checks on `https://serplists.com`:
  - `GET /api/health` -> `200`
  - `POST /api/auth/sign-up/email` -> `200` + created user
  - `POST /api/auth/sign-in/email` (unverified user) -> `EMAIL_NOT_VERIFIED`
  - `POST /api/auth/forget-password` -> `{"status":true}`
- UI checks on live site:
  - `/register` submits and redirects to `/login?verify_email=1&email=...`
  - login page shows unverified-email state and resend button
  - `/forgot-password` submit shows inbox confirmation state
- Cloudflare tail confirms `POST /api/auth/sign-up/email` returns `200` on current production deployment.
