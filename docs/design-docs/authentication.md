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
- Verification emails return to `/login?verified=1`. Links expire after Better
  Auth's default of one hour; a failed link (expired, invalid, or for a deleted
  account) returns to the same URL with `&error=<code>` appended. Login checks
  `error` before `verified`, explains the failure, and offers to resend
  (`src/lib/auth/loginNotice.ts`), then removes the one-shot parameters from the
  URL. Better Auth puts the callback into the email link unencoded, so it must
  not contain a raw `&`; `buildEmailVerifiedCallbackURL` encodes an extra `next`
  parameter one more time so it survives the link.
- Verification and reset emails use `RESEND_API_KEY`, then `USESEND_API_KEY`.
  Callbacks await delivery so provider failures surface in the request.
  `GET /api/auth/status` reports whether email delivery is available.
- Protected routes preserve the requested destination (path, query, and hash)
  through login and sign-up (`src/lib/auth/returnPath.ts`), so a signed-out
  return from Stripe keeps `?billing=success`. It travels as router state `from`
  and as a `next` query parameter, which Login, Register, and the verification
  callback carry forward so a new account returns to the page that sent it, such
  as an Organization invite. Only same-origin, non-auth paths are accepted (one
  leading `/`, not `//`); without one, Login goes to `/dashboard/settings`.
- A session check that fails (`5xx`, `429`, or a network error) is not a sign-out:
  only a successful answer with no session, or a `401`, is. `AuthProvider` retries the
  first check twice, then reports `sessionStatus: 'unavailable'`, and `RequireAuth`
  shows a retry instead of redirecting to `/login`. A failed profile refresh keeps the
  signed-in user, and the stored Organization choice is cleared only on a confirmed
  sign-out. Registration takes "verify your email" from the sign-up response (no
  session token), not from a later session check.
- Sign-in stores the user from a session read, not from the sign-in response, whose
  user has no `username` (so the account menu's Profile link and the `@username`
  label would be missing until a reload). If that read fails after a successful
  sign-in, the sign-in response's user is kept and the next session check completes
  it (`resolveSignInSession` in `src/contexts/authSession.ts`).
- Sign-out (`logout()` in `AuthProvider`, built in `src/contexts/authSession.ts`) clears
  the local session only when the server confirms it, or answers that there is no
  session (`400 FAILED_TO_GET_SESSION`, `401`). On a `429`, `403`, `5xx`, or network
  failure the session cookie is still valid, so the user stays signed in and the menu
  shows the error. Callers navigate away only on `{ ok: true }`, and a page that sends
  the user to `/login` after signing out must wait for it (`signOutAndReturn` in
  `src/features/auth/signOut.ts`): Login redirects a signed-in visitor straight to
  the return path.
- Tabs share one session cookie, so every tab follows a sign-in or sign-out made in
  another (`src/contexts/sessionSync.ts`). A tab that signs in, signs out, or loads
  the session announces its user id on a `BroadcastChannel` (a `localStorage`
  storage event where that is missing). A tab showing a different user re-reads the
  session and trusts only the server's answer: a new user replaces the old one (whose
  cached queries are then dropped), a confirmed sign-out sends protected pages to
  `/login`, and a failed check changes nothing. A tab also re-reads the session when
  it comes back into view, at most once a minute, and after a back/forward cache
  restore. Tabs never re-announce what they learned, so one change costs one session
  read per other tab.
- The server can end a session on its own: it expires, or the user signs out other
  sessions or changes their password on another device. The API client reports every
  `401` (`src/lib/unauthorizedResponses.ts`), and a signed-in tab re-reads the session:
  one check for a burst of `401`s, at most one every 5 seconds. Only a confirmed
  "no session" signs the tab out ("Your session ended. Sign in again."); `RequireAuth`
  then sends the user to `/login` with the page to return to, and the previous user's
  cached queries are dropped. A `403` never signs anyone out.
- Passwords: Better Auth enforces length (10 to 128) and rejects breached passwords;
  `Register.tsx`, `ResetPassword.tsx`, and `SecuritySection.tsx` validate the same
  policy client-side.
- Profile: `name`, `username`, `avatar_url`; public lookup through
  `GET /api/profiles/by-username?username=...` and `GET /api/profiles/by-id?userId=...`.
  Public profile and Template share URLs use the username, so Account Settings
  lets a saved username change but not be cleared (`src/pages/accountProfileUpdates.ts`).
  Saving a new username or name refreshes the cached Template lists, which embed
  the owner's username, and Share always builds the link from the signed-in owner's
  current username. Links shared under an old username stop working after a rename.
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
