# Authentication and Accounts

Better Auth provides cookie-based (httpOnly) sessions on Cloudflare Pages Functions.
Security rules and required secrets are in [SECURITY.md](../SECURITY.md).

## Where it lives

- `functions/api/better-auth.ts`: Better Auth configuration
- `functions/api/[[route]].ts`: forwards `/api/auth/*` to `auth.handler(request)`
- `functions/api/utils/session.ts`: session lookup for API handlers
- `functions/api/handlers/auth.ts`: profile endpoints
- `src/lib/auth-client.ts`: client (`credentials: "include"` plus the username plugin)
- `src/contexts/CloudflareAuthContext.tsx`: auth state, login, and registration
- `src/components/RequireAuth.tsx`: wraps authenticated `/dashboard/*` routes
- `src/pages/Login.tsx` (dev quick-fill buttons), `Register.tsx`, `ResetPassword.tsx`,
  `DashboardSettings.tsx`; `src/components/DevLoginBar.tsx` (dev only)

Better Auth needs `AsyncLocalStorage`, so `wrangler.toml` sets
`compatibility_flags = ["nodejs_compat"]`.

## Contract

Better Auth owns sign-up, sign-in, sign-out, cookie session lookup, password
changes, session revocation, password reset, and email verification. The app owns
protected-route redirects, post-login return paths, entitlement checks, rate limits,
and user-facing failure states when a supporting service is unavailable.

- Email verification is required before sign-in where
  `AUTH_EMAIL_VERIFICATION_REQUIRED=true` (production). Login offers to resend the
  verification email when sign-in is blocked.
- Verification and reset emails use `RESEND_API_KEY`, then `USESEND_API_KEY`.
  Callbacks await delivery so provider failures surface in the request.
  `GET /api/auth/status` reports whether email delivery is available.
- Protected routes preserve the requested destination through login.
- Sign-out (`logout()` in `AuthProvider`, built in `src/contexts/authSession.ts`) clears
  the local session only when the server confirms it, or answers that there is no
  session (`400 FAILED_TO_GET_SESSION`, `401`). On a `429`, `403`, `5xx`, or network
  failure the session cookie is still valid, so the user stays signed in and the menu
  shows the error. Callers navigate away only on `{ ok: true }`.
- Passwords: Better Auth enforces length (10 to 128) and rejects breached passwords;
  `Register.tsx`, `ResetPassword.tsx`, and `SecuritySection.tsx` validate the same
  policy client-side.
- Profile: `name`, `username`, `avatar_url`; public lookup through
  `GET /api/profiles/by-username?username=...` and `GET /api/profiles/by-id?userId=...`.
- Settings live at `/dashboard/settings`; `/account` and `/dashboard/profile`
  redirect there.

Better Auth endpoints are under `/api/auth/*`, for example
`POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`,
`POST /api/auth/sign-out`, `GET /api/auth/get-session`.

## Local development

Vite (`localhost:8080`) and the API (`localhost:8788`) are different origins, so
cookie sessions need `credentials: "include"` on the client and
`Access-Control-Allow-Credentials: true` with a non-`*` origin from the API
(`functions/api/utils/cors.ts` reflects the origin by default).

## Database

`db/migrations/0008_better_auth.sql` adds `email_verified`, `auth_created_at`,
`auth_updated_at`, and `display_username` to `users`, creates `account`, `session`,
and `verification`, and moves existing `users.password_hash` values into
`account` rows (provider `credential`). Better Auth's Drizzle adapter maps fields by
Drizzle property name (`account.userId`, `displayUsername`), not column name.

## Verifying changes in production

After changing auth configuration or email delivery:

1. Register a new account and confirm the UI asks for email verification.
2. Open the verification link and confirm sign-in works only afterward.
3. Request a password reset, open the link, and set a new password.
4. Confirm the new password signs in and returns to the intended page.
5. Confirm test-email blocking still covers the sign-up and sign-in endpoints.

## Troubleshooting

- `no such table: account` locally: apply migrations (`pnpm run setup`).
- `displayUsername` missing: the Drizzle field must be `displayUsername`, mapped to
  column `display_username`.
- `NOT NULL constraint failed: users.password_hash` or `users.created_at`: apply
  migrations `0014` and `0015`.
- All `/api/*` return Cloudflare `1101`: see [incident response](../RELIABILITY.md#incident-response).
- `auth_email_unavailable`: configure `RESEND_API_KEY` or `USESEND_API_KEY` and
  check `EMAIL_FROM`.
