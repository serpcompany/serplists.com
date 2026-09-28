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
  breached passwords are rejected (`haveIBeenPwned` plugin).
- **Production blocks known test-email domains** at sign-up and sign-in.
- **Agents act through Run Keys**, revocable credentials limited to reading
  Personal templates and listing, starting, reading, and updating Personal runs.
  Keys are stored hashed. The MCP routes are off on remote hosts unless
  `PERSONAL_RUN_MCP_ENABLED=true`.
- **Uploads** are written under the uploader's key prefix, and deletes are
  restricted to that prefix.
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

## Secrets in URLs and third-party tags

`index.html` loads the Google Tag Manager container, and its tags read the full page
URL (GA4 sends it as `page_location`). So:

- The bootstrap in `index.html` skips the container for any document that opens on
  `/share/*`, `/team-invites/*` or `/reset-password`, or whose query has a `token`,
  `email`, `code` or `state` parameter. The rule lives in `src/lib/analyticsUrl.ts`;
  `index.html` inlines a copy, and `tests/unit/security/gtmBootstrap.test.ts` checks
  that both agree.
- The app never puts a secret or an email address into a URL it navigates to. Sign-up
  passes the new account's email to `/login` in router state; the reset page reads its
  token once and removes it from the address bar (a reload offers a new link). When
  sign-in returns to an invite link in a document where the tags run, it loads the
  invite as a new page instead of navigating client-side.
- GA4 data redaction for email and the `token`/`email` query parameters is a useful
  second layer in the GA admin, but it cannot remove tokens in a path.

## Rate limits

Best-effort, per IP, in `functions/api/[[route]].ts`, before Better Auth dispatch:

- `/api/auth/*` (every auth route, including password reset and verification): 30
  requests per 5 minutes on deployed hosts; 300 per hour locally for testing.
- Sensitive writes (`POST`/`PUT`/`DELETE` under templates, checklists, uploads, the
  legacy Organization routes `teams`, and Run Key/MCP writes): 120 per minute.
- MCP also limits each authenticated Run Key to 120 requests per minute.

The limiter is an in-memory map (`functions/api/utils/rate-limit.ts`), so it is not
consistent across Cloudflare edges, and it is skipped when `CF-Connecting-IP` is
missing. A `429` during intensive local QA means the limit, not broken credentials.

## Admin entitlement override

`POST /api/admin/entitlements/override` grants or revokes Pro without Stripe (comps,
debugging), authenticated by the `X-Admin-Secret` header. Because it bypasses
billing, keep it disabled by default:

1. Confirm the `entitlement_overrides` table exists (normal migration checks).
2. Add `ENTITLEMENTS_ADMIN_SECRET` as a temporary Pages secret and redeploy.
3. Apply the override, then verify the D1 row and `GET /api/billing/status` for
   the user rather than trusting the command response.
4. Remove the secret, redeploy, and confirm the endpoint returns `401`.

```bash
curl -X POST "https://serplists.com/api/admin/entitlements/override" \
  -H "Content-Type: application/json" -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET" \
  -d '{"email":"user@example.com","plan":"pro"}'          # or "plan":"free" to force Free
curl -X DELETE "https://serplists.com/api/admin/entitlements/override?userId=USER_ID" \
  -H "X-Admin-Secret: $ENTITLEMENTS_ADMIN_SECRET"          # remove the override
```
