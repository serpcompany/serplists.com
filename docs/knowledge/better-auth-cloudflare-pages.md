# Better Auth on Cloudflare Pages Functions

## Overview
This project uses Better Auth for cookie-based (httpOnly) sessions.

- Server: `functions/api/better-auth.ts` (Better Auth config)
- Router mount: `functions/api/[[route]].ts` forwards `/api/auth/*` to `auth.handler(request)`
- Client: `src/lib/auth-client.ts` (`credentials: "include"` + username client plugin)

## Required env
Set in `.dev.vars` (local) and Pages secrets (prod):
- `BETTER_AUTH_SECRET` (32+ chars, preferred)
- `JWT_SECRET` (legacy fallback; also must be 32+ chars)

Optional:
- `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` for CORS allowlisting
- `RESEND_API_KEY` or `USESEND_API_KEY` for password reset + email verification emails
- `EMAIL_FROM` optional (defaults to `noreply@mail.auth.serp.co`)

Runtime and `pnpm run typecheck:env` use the same secret resolution order. At
least one valid auth secret must be present. URL settings such as
`FRONTEND_URL` and `R2_PUBLIC_BASE_URL` remain strictly validated so malformed
values cannot weaken CORS or generate invalid file URLs.

Environment failures are handled inside the request boundary. Invalid runtime
configuration must produce a structured JSON `500` response rather than an
uncaught Cloudflare `1101` failure. Auth-email actions fail early with
`503 auth_email_unavailable` when neither supported provider key is configured;
they must not report success when no message can be sent.

## Wrangler config
Better Auth requires `AsyncLocalStorage` support in the Workers runtime:
- `wrangler.toml` includes `compatibility_flags = ["nodejs_compat"]`

## Cookies + CORS (local dev)
Local dev runs Vite on `http://localhost:8080` and Pages Functions on `http://localhost:8788`.

To make cookie sessions work cross-origin:
- Client requests include `credentials: "include"` (`src/lib/api.ts`, `src/lib/auth-client.ts`)
- API responses must set `Access-Control-Allow-Credentials: true` and a non-`*` origin
  - Implemented in `functions/api/utils/cors.ts` (reflects `Origin` by default)

## Database migration
Better Auth tables and user columns are added in `db/migrations/0008_better_auth.sql`:
- Adds `email_verified`, `auth_created_at`, `auth_updated_at`, `display_username` to `users` (Drizzle field name: `displayUsername`)
- Creates `account`, `session`, `verification`
- Migrates existing `users.password_hash` into `account` rows (provider `credential`)

Local reset includes it via `pnpm run db:reset`.

Note: Better Auth's Drizzle adapter expects field mappings to use Drizzle property names (e.g., `account.userId`), not raw column names like `user_id`.

If local sign-in fails with `no such table: account`, apply the migration to local D1:
```bash
npx wrangler d1 execute serp-checklists-db --local --file=./db/migrations/0008_better_auth.sql
```

## Password policy
Server-side:
- Better Auth enforces length constraints (configured in `functions/api/better-auth.ts`).
- Better Auth blocks compromised passwords via the `haveIBeenPwned` plugin.
- Better Auth requires verified email before sign-in (`requireEmailVerification`).

Client-side:
- Registration UI validates password policy in `src/pages/Register.tsx`.
- Account Security UI validates password policy before calling `authClient.changePassword()` in `src/components/account/SecuritySection.tsx`.
- Reset password UI validates password policy in `src/pages/ResetPassword.tsx`.
- Login UI supports resend verification email when sign-in is blocked by unverified email.

## Authentication and session contract

Better Auth owns sign-up, sign-in, sign-out, cookie session lookup, password
changes, session revocation, password reset, and email verification. The app
still owns protected-route redirects, post-login return paths, entitlement
checks, rate-limit policy, and user-facing failure states for unavailable
supporting services.

- Email verification is required before sign-in.
- Verification and password-reset messages use the same provider selection:
  `RESEND_API_KEY`, then `USESEND_API_KEY`.
- Email callbacks await delivery so provider failures are visible to the
  request instead of becoming silent background failures.
- `GET /api/auth/status` reports whether auth email delivery is available.
- Protected routes preserve the requested destination through login.

## Production verification

After changing auth configuration or email delivery:

1. Register a new account and confirm the UI requests email verification.
2. Open the verification link and confirm sign-in succeeds only afterward.
3. Request a password reset, open the delivered link, and set a new password.
4. Confirm the new password signs in and the intended post-login destination is restored.
5. Confirm production test-email blocking still covers Better Auth sign-up and sign-in endpoints.

## Troubleshooting
- If sign-up fails with `displayUsername` missing in the users schema, ensure the Drizzle field name is `displayUsername` (mapped to column `display_username`) and Better Auth maps `displayUsername` to that field name.
- If sign-up fails with `NOT NULL constraint failed: users.password_hash`, apply `db/migrations/0014_make_users_password_hash_nullable.sql` so Better Auth can store credentials in the `account` table instead of `users.password_hash`.
- If sign-up fails with `NOT NULL constraint failed: users.created_at`, apply `db/migrations/0015_add_users_created_at_default.sql` to give `created_at` a default.
- If all `/api/*` routes return Cloudflare `1101`, verify that either
  `BETTER_AUTH_SECRET` or legacy `JWT_SECRET` is at least 32 characters and
  validate configured URL values with `pnpm run typecheck:env`.
- If registration, verification, or password reset reports
  `auth_email_unavailable`, configure `RESEND_API_KEY` or `USESEND_API_KEY` and
  verify `EMAIL_FROM` before retrying.
