# Authentication and Accounts

Better Auth provides cookie-based (httpOnly) sessions on Cloudflare Pages Functions.
Security rules and required secrets are in [SECURITY.md](../SECURITY.md).

## Where it lives

- `functions/api/better-auth.ts`: Better Auth configuration
- `functions/api/[[route]].ts`: forwards `/api/auth/*` to `auth.handler(request)`
- `functions/api/utils/session.ts`: read-only session lookup for API handlers
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
  verification email when sign-in is blocked. The same setting, not the request
  hostname, turns on the other production-only checks: breached-password lookups
  and test-email blocking (`functions/api/utils/auth-policy.ts`). Preview sets it to
  `false`, so `staging.serplists.com` and `*.pages.dev` previews behave the same.
- Verification and reset emails use `RESEND_API_KEY`, then `USESEND_API_KEY`.
  Callbacks await delivery so provider failures surface in the request, with one
  exception: sign-up creates the account before it sends the verification email,
  so a provider failure there is logged (`auth_email_send_failed`, user id only)
  and sign-up still succeeds. Register then sends the person to
  `/login?verify_email=1`, where they can resend it. Sign-up is refused with
  `503 auth_email_unavailable` before any account is created when verification is
  required and no provider is configured. `GET /api/auth/status` reports whether
  email delivery is available.
- Each account gets at most one email of each kind a minute and five an hour;
  extra requests succeed without sending, and a send that fails does not count
  ([rate limits](../SECURITY.md#rate-limits)).
- Protected routes preserve the requested destination through login.
- A password reset revokes every session for the account, including the one in
  the browser doing the reset; `ResetPassword.tsx` clears that browser's local
  user before sending it to `/login`. Change password revokes other sessions only
  when asked (`revokeOtherSessions`, on by default in `SecuritySection.tsx`).
- Sessions last 7 days and slide: Better Auth extends a session, and resends its
  cookie, at most once a day. Only `GET /api/auth/get-session` may do that, because
  its `Set-Cookie` reaches the browser. API handlers look sessions up read-only
  (`query: { disableRefresh: true }`); a refresh there would extend the database row
  while the new cookie is dropped, so the browser cookie would expire first. The app
  calls get-session on page load and, while signed in, at most once an hour when the
  tab regains focus or stays visible (`createSessionRechecker`).
- Only a definite answer changes the signed-in state: `get-session` returning no
  session (or a `401`) signs the user out. A `429`, `5xx`, or network failure is
  treated as unknown (`src/lib/auth/sessionCheck.ts`): the current user is kept,
  the first check on page load retries with backoff, and if it still fails
  `RequireAuth` offers a retry instead of redirecting to `/login`.
- Passwords: at least 10 characters and at most 72 UTF-8 bytes (bcrypt ignores
  anything longer; emoji are 4 bytes, accented letters 2). Better Auth enforces the
  character minimum, a `hooks.before` (`functions/api/utils/password-length.ts`)
  rejects longer new passwords at sign-up, change-password and reset-password, and
  production also rejects breached passwords. Sign-in never checks the length, so
  passwords set before the limit still work. `Register.tsx`, `ResetPassword.tsx`,
  and `SecuritySection.tsx` validate the same limits client-side through
  `src/lib/schemas/passwordLimits.ts`.
- Profile: `name`, `username`, `avatar_url`; public lookup through
  `GET /api/profiles/by-username?username=...` and `GET /api/profiles/by-id?userId=...`.
  The username lookup trims the value and ignores its case: it matches the value as
  given (usernames saved before Better Auth may be mixed case) or its lowercase
  form, preferring an exact match, with an `IN` list that stays on
  `idx_users_username`. `/profile/JohnDoe` then replaces the URL with the stored
  `/profile/johndoe`, and Account settings previews the lowercase URL.
  Better Auth does not validate `name` or `image`, so `databaseHooks.user` checks
  them on every user write (`functions/api/utils/user-profile-validation.ts`): the
  name is trimmed and must be 1-100 characters, and the avatar must be an upload
  served under `/api/uploads/` by this API or `R2_PUBLIC_BASE_URL`. Updates check
  only the fields they write. The limits live in `src/lib/schemas/userProfileSchema.ts`,
  which `Register.tsx` and `ProfileSection.tsx` use for `maxLength`.
- Usernames are stored lowercase (the username plugin's normalizer) and are unique
  (`idx_users_username`). The plugin's "already taken" check never runs on
  `/update-user` in Better Auth 1.3.4, because it looks for a session before the
  endpoint loads one, so `databaseHooks.user.update` repeats it with the caller's
  session (`functions/api/utils/username-conflict.ts`). A write that still hits the
  unique index, when two requests claim a name at once, is mapped to the same
  `422 USERNAME_IS_ALREADY_TAKEN` instead of a bodyless 500. Re-saving your own
  username in a different case is allowed.
- Settings live at `/dashboard/settings`; `/account` and `/dashboard/profile`
  redirect there.

Better Auth endpoints are under `/api/auth/*`, for example
`POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`,
`POST /api/auth/sign-out`, `GET /api/auth/get-session`.
State-changing auth requests must send a JSON body from a trusted origin; the
router refuses form posts and cross-site requests before Better Auth runs
([SECURITY.md](../SECURITY.md#model)).

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
5. Confirm test-email blocking still covers the sign-up and sign-in endpoints,
   including sign-in by username.

## Troubleshooting

- `no such table: account` locally: apply migrations (`pnpm run setup`).
- `displayUsername` missing: the Drizzle field must be `displayUsername`, mapped to
  column `display_username`.
- `NOT NULL constraint failed: users.password_hash` or `users.created_at`: apply
  migrations `0014` and `0015`.
- All `/api/*` return Cloudflare `1101`: see [incident response](../RELIABILITY.md#incident-response).
- `auth_email_unavailable`: configure `RESEND_API_KEY` or `USESEND_API_KEY` and
  check `EMAIL_FROM`.
