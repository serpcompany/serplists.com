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
- Adds `email_verified`, `auth_created_at`, `auth_updated_at`, `display_username` to `users`
- Creates `account`, `session`, `verification`
- Migrates existing `users.password_hash` into `account` rows (provider `credential`)

Local reset includes it via `pnpm run db:reset`.

## Password policy
Server-side:
- Better Auth enforces length constraints (configured in `functions/api/better-auth.ts`).
- Better Auth blocks compromised passwords via the `haveIBeenPwned` plugin.

Client-side:
- Registration UI validates password policy in `src/pages/Register.tsx`.
- Account Security UI validates password policy before calling `authClient.changePassword()` in `src/components/account/SecuritySection.tsx`.
