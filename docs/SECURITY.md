# Security

## Model

- **The API is authoritative.** Handlers authorize every request; UI gating is only
  convenience. Never trust a client-supplied Organization id (legacy `teamId`)
  without checking Organization Membership and role
  ([organizations](design-docs/organizations.md)).
- **Sessions are Better Auth httpOnly cookies.** The client never stores auth
  tokens; requests use `credentials: "include"`. Details:
  [authentication](design-docs/authentication.md).
- **Email verification is required** before sign-in in production, and
  breached passwords are rejected (`haveIBeenPwned` plugin). "Production" here is
  the auth policy `AUTH_EMAIL_VERIFICATION_REQUIRED=true` from `wrangler.toml`
  (`functions/api/utils/auth-policy.ts`), never the request hostname, so preview
  domains such as `staging.serplists.com` get the preview policy.
- **A password reset signs out every session** for the account
  (`revokeSessionsOnPasswordReset`), so recovering an account removes anyone
  holding a stolen session. This takes effect immediately only because sessions
  are read from D1; enabling Better Auth's `session.cookieCache` would let revoked
  sessions live until the cache expires. Run Keys are separate credentials and are
  not revoked by a reset.
- **New passwords are 10 characters to 72 UTF-8 bytes.** Passwords are hashed
  with bcrypt, which ignores everything after 72 bytes, so a longer password
  would be stored as its first 72 bytes. A Better Auth `hooks.before`
  (`functions/api/utils/password-length.ts`) rejects a longer new password at
  sign-up, change-password, reset-password and set-password on every host, before
  anything is written. Sign-in is never limited: it would reveal which emails have
  accounts, and passwords set before the limit keep working. The limits live in
  `src/lib/schemas/passwordLimits.ts`, which the forms share.
- **Production blocks known test-email domains** at sign-up and sign-in. The
  router checks the email in sign-up and sign-in bodies, and Better Auth's
  `databaseHooks` (`user.create` and `session.create`) enforce it for every other
  path, including username sign-in (`functions/api/utils/test-email-block.ts`).
- **Auth requests are CSRF-protected in the router.** Better Auth also parses
  form-encoded and multipart bodies and checks `Origin` only when cookies are sent,
  so a cross-site HTML form could sign a visitor into another account or sign them
  out. `functions/api/utils/auth-request-guard.ts` requires every non-`GET`
  `/api/auth/*` request to send `Content-Type: application/json` (`415` otherwise),
  which forces a CORS preflight for other origins, and refuses with `403` a request
  whose `Origin` is not the API's own origin, `FRONTEND_URL`, or
  `CORS_ALLOWED_ORIGINS` (including `Origin: null`), or that has no `Origin` but is
  marked `Sec-Fetch-Site: cross-site`. Scripts that send neither header still work.
- **Account fields are validated on every user write.** Better Auth accepts any
  value for `name` and `image`, so `databaseHooks.user` in
  `functions/api/better-auth.ts` (rules in `functions/api/utils/user-profile-validation.ts`
  and `src/lib/schemas/userProfileSchema.ts`) rejects with `400` a name that is not
  1-100 characters of text after trimming, a display username over 30 characters,
  and an avatar that is not an upload served by SERP Lists (the request or frontend
  origin, or `R2_PUBLIC_BASE_URL`, under `/api/uploads/`, at most 2048 characters).
  `null` or an empty string removes the avatar. Updates check only the fields they
  write, so Better Auth's internal updates (email verification, username) pass.
- **Agents act through Run Keys**, revocable credentials limited to reading
  Personal templates and listing, starting, reading, and updating Personal runs.
  Keys are stored hashed. The MCP routes are off on remote hosts unless
  `PERSONAL_RUN_MCP_ENABLED=true`.
- **Uploads** are written under the uploader's key prefix. Only an account's own
  avatar (`avatars/<userId>/<file>`, matched segment by segment) can be deleted.
  Template media cannot be deleted by anyone: Templates, versions, Runs and
  public-template clones may reference it, and uploads record no Personal or
  Organization owner, so the uploader (who may since have been disabled in or
  removed from the Organization) must not be able to break Organization content.
  Clearing or replacing template media only unlinks it (TD-17). Each bucket has a size limit (avatars 5MB, Template
  images, videos and files 50MB; `src/lib/schemas/uploadLimits.ts`, shared with the
  upload forms) and a MIME allowlist. A file with no type, or the generic
  `application/octet-stream`, is typed from its extension and rejected if that
  type is not allowed. There is no per-account storage quota yet (TD-16).
- **Invites** store only a token hash, never the raw token.

## Secrets and environment

`.dev.vars` is the only local env file and holds local/test values only. `.env`
and `.env.local` are deprecated. Production values are Cloudflare Pages secrets.

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required. 32+ characters. `JWT_SECRET` is a legacy fallback with the same rule |
| `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID` | Required for Checkout |
| `STRIPE_WEBHOOK_SECRET` | Required only by the webhook endpoint |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Required for self-serve subscription management |
| `RESEND_API_KEY` or `USESEND_API_KEY` | At least one, for verification and reset emails; otherwise auth-email actions return `503 auth_email_unavailable` |
| `EMAIL_FROM` | Optional sender override (default `noreply@mail.auth.serp.co`) |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | Optional CORS allowlist |
| `R2_PUBLIC_BASE_URL` | Optional public file URL base |
| `ENTITLEMENTS_ADMIN_SECRET` | Optional; enables the admin override endpoint (below) |
| `PERSONAL_RUN_MCP_ENABLED`, `VITE_PERSONAL_RUN_MCP_ENABLED` | Optional; enable Run Key and MCP routes on a remote host (on by default only for localhost) |

Rules:

- `pnpm run typecheck:env` and the runtime validate env the same way, with
  `@t3-oss/env-core` and Zod (`functions/api/env.ts`, `src/env.ts` for `VITE_`
  client variables, `emptyStringAsUndefined: true`). URL values are strictly
  validated so a malformed value cannot weaken CORS.
- Invalid runtime configuration returns a structured JSON `500`, never an uncaught
  Cloudflare `1101`.
- Stripe live keys never enter `.dev.vars`: env validation rejects `sk_live_`
  values and `*_LIVE` names. Live Stripe administration takes keys injected into
  the process environment by an approved secret manager. `pnpm run
  stripe:local:scrub-live` removes production-only Stripe entries from a checkout.
- `pnpm run secret:scan` (secretlint) runs in CI and on staged files at commit.
- Keep preview and production Pages secrets separate.
- GitHub Actions secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`, and
  `CLOUDFLARE_API_KEY` for deploys; `CLAUDE_CODE_OAUTH_TOKEN` for Claude code review.
  The review token is a personal subscription credential, and the review job has
  read-only repository permissions.

## CORS

Applied in `functions/api/[[route]].ts` through `functions/api/utils/cors.ts`:

- With no allowlist, the API answers `Access-Control-Allow-Origin: *`, or reflects
  the request `Origin` with `Access-Control-Allow-Credentials: true` when one is
  present (needed for cookies in local dev).
- With `FRONTEND_URL` and/or `CORS_ALLOWED_ORIGINS` set, only matching origins are
  reflected, and `OPTIONS` preflights from other origins get `403`.
- `X-Request-Id` is exposed to the client for correlation.

Locally, the dev launcher keeps the frontend origin and the allowlist in sync when
it moves ports. Do not hand-edit only one side.

## Rate limits

Best-effort, per IP, in `functions/api/[[route]].ts`, before Better Auth dispatch:

- Session checks (exactly `GET /api/auth/get-session` and `GET /api/auth/status`):
  600 requests per 5 minutes, in their own bucket, so page loads from a shared IP
  never lock signed-in users out or eat into the sign-in limit.
- Every other `/api/auth/*` route (sign-in by email or username, sign-up, password
  reset, verification links, username checks, and any future Better Auth
  endpoint): 30 requests per 5 minutes on deployed hosts; 300 per hour locally for
  testing. This is deny-by-default: `functions/api/utils/auth-rate-limit.ts` matches
  the session-check allowlist on method and exact path.
- Sensitive writes (`POST`/`PUT`/`PATCH`/`DELETE` under templates, checklists,
  uploads, the legacy Organization routes `teams`, Run Key/MCP writes, and admin):
  120 per minute.
- Billing checkout and portal (`POST /api/billing/*`), which each call Stripe, whose
  rate limit the whole Stripe account shares: 10 per minute per IP on deployed hosts
  (120 locally), in their own bucket, and 10 per minute per account in the billing
  handler whatever the IP. `GET /api/billing/status` and Stripe webhooks are never
  limited.
- `functions/api/utils/route-rate-limit.ts` holds the non-auth buckets. Every route
  family the router dispatches is either limited there or listed in
  `RATE_LIMIT_EXEMPT_ROUTES` with a reason; a unit test reads the router to check.
- MCP also limits each authenticated Run Key to 120 requests per minute.
- Password-reset and verification emails are also limited per account, whatever
  the IP: at most one of each kind a minute and five an hour
  (`functions/api/utils/auth-email-throttle.ts`, called from the Better Auth send
  callbacks). The count is one primary-key upsert in D1 (a `verification` row with
  id `auth-email-throttle:<kind>:<userId>`), so it holds across edges and concurrent
  requests. A skipped send returns the same response as a sent one, and the unused
  reset token is deleted. A send the provider rejects does not count. Verification emails are never sent to an address that is
  already verified. If D1 fails, the email is sent (fail open).

The limiter is an in-memory map (`functions/api/utils/rate-limit.ts`), so it is not
consistent across Cloudflare edges, and it is skipped when `CF-Connecting-IP` is
missing. A `429` during intensive local QA means the limit, not broken credentials.

## Request size limits

Request bodies are capped in the router before any handler runs
(`functions/api/utils/body-limit.ts`), for every `POST`/`PUT`/`PATCH`/`DELETE`
whatever the `Content-Type`, because handlers parse JSON without checking it: 1MB by
default, 16KB for `/api/auth/*`, 2MB for Template backups, and 50MB (plus multipart
overhead) for uploads.
The cap uses `Content-Length`, or counts streamed bytes when it is missing
(uploads without it are left to the upload handler, which requires a session before
parsing and rejects files over 50MB). The unauthenticated shared Run update checks
its share token before reading the body.

## Admin entitlement override

`POST /api/admin/entitlements/override` grants or revokes Pro without Stripe (comps,
debugging), authenticated by the `X-Admin-Secret` header. Because it bypasses
billing, keep it disabled by default:

1. Confirm the `entitlement_overrides` table exists (normal migration checks).
2. Add `ENTITLEMENTS_ADMIN_SECRET` as a temporary Pages secret and redeploy.
3. Apply the override, then verify the D1 row and `GET /api/billing/status` for
   the user rather than trusting the command response.
4. Remove the secret, redeploy, and confirm the endpoint returns `401`.

The body is parsed strictly and an invalid one gets `400` with nothing written:

- `userId` or `email` (or both, which must name the same User). An unknown User gets
  `404`. The email is matched as given and lowercased.
- `plan`: `"pro"` (the default) or `"free"`.
- `expiresAt`: whole Unix **seconds**, in the future and at most 5 years away. Omit it
  or send `null` for an override that never expires. Date strings, milliseconds,
  fractions and past times are rejected rather than read as "never expires".
- `note`: optional, at most 500 characters.

A second request for the same User replaces its override. The response echoes the
stored `expiresAt` and an `expiresAtIso` rendering of it.

```bash
curl -X POST "https://serplists.com/api/admin/entitlements/override" \
  -H "Content-Type: application/json" -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET" \
  -d '{"email":"user@example.com","plan":"pro"}'          # or "plan":"free" to force Free
curl -X POST "https://serplists.com/api/admin/entitlements/override" \
  -H "Content-Type: application/json" -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET" \
  -d "{\"email\":\"user@example.com\",\"plan\":\"pro\",\"expiresAt\":$(( $(date +%s) + 30*86400 ))}"  # 30 days
curl -X DELETE "https://serplists.com/api/admin/entitlements/override?userId=USER_ID" \
  -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET"          # remove the override
```
