# Better Auth on Cloudflare Pages Functions

## Overview
This project uses Better Auth for cookie-based (httpOnly) sessions.

- Server: `functions/api/better-auth.ts` (Better Auth config)
- Router mount: `functions/api/[[route]].ts` forwards `/api/auth/*` to `auth.handler(request)`
- Client: `src/lib/auth-client.ts` (`credentials: "include"` + username client plugin)

## Required env
Set in `.dev.vars` (local) and Pages secrets (prod):
- `BETTER_AUTH_SECRET` (32+ chars)

Optional:
- `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` for CORS allowlisting
- `RESEND_API_KEY` + `EMAIL_FROM` for password reset emails

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

Client-side:
- Registration UI validates password policy in `src/pages/Register.tsx`.
- Account Security UI validates password policy before calling `authClient.changePassword()` in `src/components/account/SecuritySection.tsx`.
- Reset password UI validates password policy in `src/pages/ResetPassword.tsx`.

## Troubleshooting
- If sign-up fails with `displayUsername` missing in the users schema, ensure the Drizzle field name is `displayUsername` (mapped to column `display_username`) and Better Auth maps `displayUsername` to that field name.
- If sign-up fails with `NOT NULL constraint failed: users.password_hash`, apply `db/migrations/0014_make_users_password_hash_nullable.sql` so Better Auth can store credentials in the `account` table instead of `users.password_hash`.
- If sign-up fails with `NOT NULL constraint failed: users.created_at`, apply `db/migrations/0015_add_users_created_at_default.sql` to give `created_at` a default.
