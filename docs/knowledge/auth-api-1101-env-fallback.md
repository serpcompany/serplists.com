# API 1101 on auth routes: env validation + auth secret fallback

## Symptoms
- `https://serplists.com/api/*` returns Cloudflare `1101`.
- Registration and password reset fail on the live site.
- Health endpoint also fails (`/api/health`).

## Root cause
- API startup env validation ran before request handling and threw hard errors.
- `BETTER_AUTH_SECRET` was treated as mandatory with no legacy fallback.
- Optional URL env values (for example `FRONTEND_URL`) could also hard-fail the whole API when malformed.

## Fix implemented
- Added auth secret resolver with fallback:
  - Prefer `BETTER_AUTH_SECRET` (32+ chars).
  - Fallback to legacy `JWT_SECRET` (32+ chars).
- Updated `scripts/check-env.mjs` (`typecheck:env`) to use the same fallback contract so setup/deploy checks match runtime behavior.
- Moved env validation into guarded request handling so misconfig returns JSON `500` instead of uncaught worker crash (`1101`).
- Kept strict URL validation for `FRONTEND_URL` and `R2_PUBLIC_BASE_URL` so malformed values fail closed instead of weakening CORS or generating broken file URLs.
- Kept strict fail-fast for auth secret quality (must still be 32+ chars).

## Verification
- Unit test: `tests/unit/functions/api/auth-secret.test.ts`
- Integration test: `tests/integration/api.workerless.test.ts`
  - Health works with legacy `JWT_SECRET` when `BETTER_AUTH_SECRET` is missing.
  - Health does not crash when `FRONTEND_URL` is malformed.
- Env check parity:
  - `JWT_SECRET=<32+ chars> node scripts/check-env.mjs` passes without `BETTER_AUTH_SECRET`.
  - Script fails when neither secret is valid.
- Browser E2E (local):
  - `/register` successfully creates account and lands on `/dashboard`.
  - `/forgot-password` successfully posts to `/api/auth/request-password-reset` and shows confirmation state.

## Deployment follow-up
- Ensure production has at least one valid 32+ char secret:
  - `BETTER_AUTH_SECRET` (preferred), or
  - `JWT_SECRET` (legacy fallback).
- Ensure `RESEND_API_KEY` and `EMAIL_FROM` are configured for real password reset email delivery.
