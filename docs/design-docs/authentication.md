# Authentication and Accounts

Better Auth provides cookie-based (httpOnly) sessions from the API, which runs in the app's
Cloudflare Worker (the route handler `src/app/api/[[...route]]/route.ts`).
Security rules and required secrets are in [SECURITY.md](../SECURITY.md).

## Where it lives

- `functions/api/better-auth.ts`: Better Auth configuration
- `functions/api/[[route]].ts`: forwards `/api/auth/*` to `auth.handler(request)`
- `functions/api/utils/session.ts`: read-only session lookup for API handlers
- `functions/api/utils/better-auth-logger.ts`: Better Auth's own log lines, as JSON without
  email addresses (its default logger prints them to the console)
- `functions/api/handlers/auth.ts`: profile endpoints
- `src/lib/auth-client.ts`: client (`credentials: "include"` plus the username plugin)
- `src/contexts/CloudflareAuthContext.tsx`: auth state, login, and registration
- `src/components/RequireAuth.tsx`: wraps authenticated `/dashboard/*` routes
- `src/views/Login.tsx` (dev quick-fill buttons), `Register.tsx`, `ResetPassword.tsx`,
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
  `false`, so staging behaves the same on every host it answers on.
  Every deployed environment sets it; where it is unset (tests, ad hoc runs),
  verification is required whenever an email provider is configured.
- Verification emails return to `/login/?verified=1`. Links expire after Better
  Auth's default of one hour; a failed link (expired, invalid, or for a deleted
  account) returns to the same URL with `&error=<code>` appended. Login checks
  `error` before `verified`, explains the failure, and offers to resend
  (`src/lib/auth/loginNotice.ts`), then removes the one-shot parameters from the
  URL. Better Auth puts the callback into the email link unencoded, so it must
  not contain a raw `&`; `buildEmailVerifiedCallbackURL` encodes an extra `next`
  parameter one more time so it survives the link.
- Verification and reset emails use `RESEND_API_KEY`, then `USESEND_API_KEY`.
  Callbacks await delivery so provider failures surface in the request, with one
  exception: sign-up creates the account before it sends the verification email,
  so a provider failure there is logged (`auth_email_send_failed`, user id only)
  and sign-up still succeeds. Register then sends the person to
  `/login/?verify_email=1`, where they can resend it. Only a delivery failure is
  passed over that way: an `AuthEmailDeliveryError` (a non-2xx reply or a network
  error), which names the provider, the email kind and the status, never the address
  or the provider's reply, which can echo it. A missing provider is a configuration
  error and fails the request. Sign-up is refused with
  `503 auth_email_unavailable` before any account is created when verification is
  required and no provider is configured. `GET /api/auth/status` reports whether
  email delivery is available.
- Each account gets at most one email of each kind a minute and five an hour;
  extra requests succeed without sending, and a send that fails does not count
  ([rate limits](../SECURITY.md#rate-limits)). `/send-verification-email` needs no
  session and accepts any registered address, so its callback sends nothing to an
  address that is already verified. (Change-email, which is not enabled, would pass
  the user with `emailVerified` false, so the skip would not get in its way.)
- Protected routes preserve the requested destination (path, query, and hash)
  through login and sign-up (`src/lib/auth/returnPath.ts`), so a signed-out
  return from Stripe keeps `?billing=success`. It travels as the `next` query
  parameter, which Login, Register, and the verification callback carry forward so
  a new account returns to the page that sent it, such as an Organization invite. Only same-origin, non-auth paths are accepted (one
  leading `/`, not `//`, checked again after dot segments are removed, so
  `/.//host` is rejected too); without one, Login goes to the console home,
  `/dashboard/templates/` (`getPostSignInDestination`).
- A password reset revokes every session for the account, including the one in
  the browser doing the reset (`onPasswordReset` runs before Better Auth deletes the
  sessions, so it only logs `password_reset_completed` and must never throw);
  `ResetPassword.tsx` signs that browser out locally (the server answers that its
  session is gone) before sending it to `/login/`.
  Change password revokes other sessions only when asked (`revokeOtherSessions`,
  on by default in `SecuritySection.tsx`).
- Sessions last 7 days and slide: Better Auth extends a session, and resends its
  cookie, at most once a day. Only `GET /api/auth/get-session` may do that, because
  its `Set-Cookie` reaches the browser. API handlers look sessions up read-only
  (`query: { disableRefresh: true }`); a refresh there would extend the database row
  while the new cookie is dropped, so the browser cookie would expire first. The app
  calls get-session on page load and on the re-checks below, and a signed-in tab
  that has not read it for an hour reads it when it regains focus or on a timer
  while it stays visible (`keepAlive` and `startSessionKeepAlive` in
  `src/contexts/sessionSync.ts`, started by `AuthProvider` while a user is signed in).
- A handler's session lookup (`getSessionUserId`) returns `null`, and the handler
  answers `401`, only when there is no valid session. If the lookup itself fails
  (a D1 outage, or Better Auth cannot be set up), it logs `session_lookup_failed`
  (the error's name and status only, since a wrapped query error can carry the
  session token) and rethrows, so the API answers `500`. A `401` there would send a
  signed-in user to `/login/`, or quietly show them anonymous data. Anonymous requests never reach
  D1 here, so public pages are unaffected.
- Auth errors the API router sends itself, before Better Auth runs (rate limit,
  blocked test account, `auth_email_unavailable`, a non-JSON body or an untrusted
  Origin, an oversized body, a server error), use `authJsonError`: `{ message, error,
  code }`, because the Better Auth client hands the UI the parsed body and Better
  Auth's own errors put the text in `message`. The `429` is code `rate_limited` with
  `Retry-After` and `retryAfterSeconds` in the body, since the client cannot read the
  header from Better Auth's result. The UI reads every auth error through
  `getAuthErrorMessage` (`src/lib/auth/authErrors.ts`): a `429` always becomes a
  "Too many attempts" wait message, never a failed-login message; otherwise it shows
  `message`, then `error`, then the page's fallback. Unverified email is detected by
  the `EMAIL_NOT_VERIFIED` code.
- A session check that fails (`5xx`, `429`, or a network error) is not a sign-out:
  only a successful answer with no session, or a `401`, is
  (`classifySessionResult` in `src/contexts/authSession.ts`). `AuthProvider` retries
  the first check twice, one and then three seconds later (each attempt counts against
  the auth rate limit, so there are few), then reports `sessionStatus: 'unavailable'`
  and checks again when the browser comes back online; `RequireAuth` shows a retry
  instead of redirecting to `/login/`. A failed profile refresh or sign-in session read
  keeps the current user, and the stored Organization choice is cleared only on a
  confirmed sign-out. Registration takes "verify your email" from the sign-up response
  (no session token), not from a later session check.
- Sign-in stores the user from a session read, not from the sign-in response, whose
  user has no `username` (so the account menu's Profile link and the `@username`
  label would be missing until a reload). If that read fails after a successful
  sign-in, the sign-in response's user is kept and the next session check completes
  it (`resolveSignInSession` in `src/contexts/authSession.ts`).
- Sign-out (`logout()` in `AuthProvider`, built in `src/contexts/authSession.ts`) clears
  the local session only when the server confirms it, or answers that there is no
  session (`400 FAILED_TO_GET_SESSION`, `401`). On a `429`, `403`, `5xx`, or network
  failure the session cookie is still valid, so the user stays signed in and the menu
  shows the error. A second sign-out while one is in flight shares its request.
  Callers navigate away only on `{ ok: true }`, and a page that sends
  the user to `/login/` after signing out must wait for it (`signOutAndReturn` in
  `src/features/auth/signOut.ts`): Login redirects a signed-in visitor straight to
  the return path.
- Tabs share one session cookie, so every tab follows a sign-in or sign-out made in
  another (`src/contexts/sessionSync.ts`). A tab that signs in, signs out, or loads
  the session announces its user id on a `BroadcastChannel` (a `localStorage`
  storage event where that is missing; each write carries a timestamp, since the
  browser fires the event only when the stored value changes). Loading counts because
  an email verification link signs in the tab it opens, and tabs still showing the
  previous user must re-check. A tab showing a different user re-reads the
  session and trusts only the server's answer: a new user replaces the old one (whose
  cached queries are then dropped), a confirmed sign-out sends protected pages to
  `/login/`, and a failed check changes nothing. A tab also re-reads the session when
  it comes back into view, at most once a minute (each read is a D1 query; a minute is
  also the Organizations list's stale time, as both read `SESSION_RECHECK_INTERVAL_MS`,
  so that list's refetch on focus rarely runs without a session check), and after a
  back/forward cache restore, which may have missed messages. Answers can arrive out of
  order, so each read takes a ticket when it
  starts and its answer is dropped when a later read, or a sign-in or sign-out in this
  tab, was applied first; a failed read never outranks an older answer. One re-check
  runs at a time, and a request made during one queues one more, since the running
  check may have read the session before the change. A re-check that finds the same
  user with a changed profile (name, username, avatar, email) shows the new one, and a
  tab that saves a profile change announces it (`refreshProfile`), so the other tabs
  showing that user re-read the session: share links and the Profile link are built
  from the session's username.
  Tabs never re-announce what they learned, so one change costs one session
  read per other tab. Before a background sign-out or switch to another user is
  applied, pages with unsaved work keep it on the tab to offer it back after sign-in
  (`beforeSessionLost`; see "Unsaved changes" in [FRONTEND.md](../FRONTEND.md)).
- The server can end a session on its own: it expires, or the user signs out other
  sessions or changes their password on another device. The API client reports every
  `401` (`src/lib/unauthorizedResponses.ts`), and a signed-in tab re-reads the session:
  one check for a burst of `401`s, at most one every 5 seconds. Only a confirmed
  "no session" signs the tab out ("Your session ended. Sign in again."); `RequireAuth`
  then sends the user to `/login/` with the page to return to, and the previous user's
  cached queries are dropped. A `403` never signs anyone out.
- Passwords: at least 10 characters and at most 72 UTF-8 bytes (bcrypt ignores
  anything longer; emoji are 4 bytes, accented letters 2). Better Auth enforces the
  character minimum, a `hooks.before` (`functions/api/utils/password-length.ts`)
  rejects missing or longer new passwords at sign-up, change-password and
  reset-password, and production also rejects breached passwords. Sign-in never checks
  the length, so passwords set before the limit still work. `Register.tsx`,
  `ResetPassword.tsx`, and `SecuritySection.tsx` validate the same limits client-side
  through `src/lib/schemas/passwordLimits.ts`.
- Profile: `name`, `username`, `avatar_url`; public lookup through
  `GET /api/profiles/by-username?username=...` and `GET /api/profiles/by-id?userId=...`.
  Both resolve only Users who have a username; `by-id` returns 404 for anyone else, so an
  id from a public response never turns into the name of someone without a public profile.
  The username lookup trims the value and ignores its case: it matches the value as
  given (usernames saved before Better Auth may be mixed case) or its lowercase
  form, preferring an exact match, with an `IN` list that stays on
  `idx_users_username`. `/profile/JohnDoe/` then replaces the URL with the stored
  `/profile/johndoe/`. Account settings links the saved username as stored (a legacy
  mixed-case one is found only in that casing, and its lowercase form can be another
  User's, since `idx_users_username` compares case) and previews an unsaved edit as the
  lowercase URL it will have (`buildProfilePreviewPath` in `src/lib/routes.ts`).
  Better Auth does not validate `name` or `image`, so `databaseHooks.user` checks
  them on every user write (`functions/api/utils/user-profile-validation.ts`), and
  the update hook always returns the checked data, because Better Auth replaces the
  update with what that hook returns: the
  name is trimmed and must be 1-100 characters, and the avatar must be an upload
  served under `/api/uploads/` by this API or `R2_PUBLIC_BASE_URL`. Updates check
  only the fields they write. The limits live in `src/lib/schemas/userProfileSchema.ts`,
  which `Register.tsx` and `ProfileSection.tsx` use for `maxLength`.
  Public profile and Template share URLs use the username, so Account Settings
  lets a saved username change but not be cleared (`src/views/accountProfileUpdates.ts`).
  The avatar saves as soon as it is uploaded or removed, so the form always shows the
  server's; a session refresh (after an avatar change, or a rename in another tab) keeps
  the Full Name and Username the user is still editing (`syncProfileForm`).
  Saving a new username or name refreshes the cached Template lists, which embed
  the owner's username, and Share always builds the link from the signed-in owner's
  current username. Links shared under an old username stop working after a rename.
- Usernames are stored lowercase (the username plugin's normalizer) and are unique
  (`idx_users_username`). The plugin's "already taken" check never runs on
  `/update-user` in Better Auth 1.3.4, because it looks for a session before the
  endpoint loads one, so `databaseHooks.user.update` repeats it with the caller's
  session (`functions/api/utils/username-conflict.ts`); an update with no signed-in
  caller (Better Auth's own writes) skips it. A write that still hits the
  unique index, when two requests claim a name at once, is mapped to the same
  `422 USERNAME_IS_ALREADY_TAKEN` instead of a bodyless 500. Re-saving your own
  username in a different case is allowed.
- Settings live at `/dashboard/settings/`; `/account` and `/dashboard/profile`
  redirect there.

Better Auth endpoints are under `/api/auth/*`, for example
`POST /api/auth/sign-in/email`, `POST /api/auth/sign-up/email`,
`POST /api/auth/sign-out`, `GET /api/auth/get-session`.
State-changing auth requests must send a JSON body from a trusted origin; the
router refuses form posts and cross-site requests before Better Auth runs
([SECURITY.md](../SECURITY.md#model)).

## Local development

`pnpm run dev:all` serves the pages and the API on one origin, as deployed, so the
session cookie is first-party. The client still sends `credentials: "include"`, and the
API answers another allowed origin with `Access-Control-Allow-Credentials: true` and a
non-`*` origin (`functions/api/utils/cors.ts` reflects the origin when no allowlist is
set).

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
