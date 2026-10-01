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
- **Reset and verification links use the host the request reached.**
  `createBetterAuth` pins `baseURL` to the request origin, because Better Auth
  1.3.4 otherwise builds links (and a trusted origin) from `X-Forwarded-Host`,
  which a client can send; the router also drops that header. On Cloudflare the
  host in `request.url` is one routed to this project, so a client cannot choose
  it. Keep `baseURL` pinned, as an origin with no path (Better Auth does not append
  `basePath` to one that has a path), and leave `advanced.trustedProxyHeaders` off
  when upgrading.
- **New passwords are 10 characters to 72 UTF-8 bytes.** Passwords are hashed
  with bcrypt, which ignores everything after 72 bytes, so a longer password
  would be stored as its first 72 bytes. A Better Auth `hooks.before`
  (`functions/api/utils/password-length.ts`) rejects a longer new password at
  sign-up, change-password, reset-password and set-password on every host, before
  anything is written, and answers a missing one with `400 Invalid password` (Better
  Auth's sign-up would otherwise fail with a 500). Sign-in is never limited: it would
  reveal which emails have accounts, and passwords set before the limit keep working.
  The limits live in `src/lib/schemas/passwordLimits.ts`, which the forms share.
- **Production blocks known test-email domains** at sign-up and sign-in. The
  router checks the email in sign-up and sign-in bodies, and Better Auth's
  `databaseHooks` (`user.create` and `session.create`) enforce it for every other
  path, including username sign-in (`functions/api/utils/test-email-block.ts`).
- **Auth requests are CSRF-protected in the router.** Better Auth also parses
  form-encoded and multipart bodies and checks `Origin` only when cookies are sent,
  and a cross-site HTML form needs no CORS preflight and sends no `SameSite=Lax`
  session cookie, so it could sign a visitor into another account or sign them
  out. `functions/api/utils/auth-request-guard.ts` requires every non-`GET`
  `/api/auth/*` request to send `Content-Type: application/json` (`415` otherwise),
  which forces a CORS preflight for other origins, and refuses with `403` a request
  whose `Origin` is not the API's own origin, `FRONTEND_URL`, or
  `CORS_ALLOWED_ORIGINS` (the set Better Auth trusts, `resolveTrustedOrigins` in
  `functions/api/utils/cors.ts`; including `Origin: null`), or that has no `Origin`
  but is marked `Sec-Fetch-Site: cross-site`. Scripts that send neither header still
  work.
- **Account fields are validated on every user write.** Better Auth accepts any
  value for `name` and `image`, so `databaseHooks.user` in
  `functions/api/better-auth.ts` (rules in `functions/api/utils/user-profile-validation.ts`
  and `src/lib/schemas/userProfileSchema.ts`) rejects with `400` a name that is not
  1-100 characters of text after trimming, a name or display username with a control
  character (C0 or DEL, never part of a name people can see), a display username over 30
  characters, and an avatar that is not an upload served by SERP Lists (the request or
  frontend origin, or `R2_PUBLIC_BASE_URL`, under `/api/uploads/`, at most 2048 characters),
  so an avatar is never a `data:` URI or a third-party tracker.
  `null` or an empty string removes the avatar. Updates check only the fields they
  write, so Better Auth's internal updates (email verification, username) pass.
- **Agents act through Run Keys**, revocable credentials limited to the owner's
  Personal templates and runs and, within that, to the permissions chosen when the
  key was created (`src/lib/schemas/runKeyPermissions.ts`): `templates:read`,
  `templates:write`, `runs:read`, `runs:write`. Each write implies its read, and
  `runs:write` also implies `templates:read` because starting a run copies the
  template's current content into the run. New keys
  default to everything except `templates:write`, and permissions cannot be edited
  afterwards. The MCP lists only the tools a key's permissions cover and refuses the
  rest with `permission_denied`. A stored value that fails to parse grants nothing.
  Templates a key creates are private; a key cannot delete or publish templates or
  edit a public one (checked again inside the write, so a template published at the
  same moment refuses the edit), and template writes use the web editor's code path
  (`createTemplateForUser`, `updateTemplateForUser`), so they get the same
  validation, template limit, version check, history, and run sync (a
  `templates:write` edit therefore also updates the owner's in-progress private runs
  of that template).
  Keys are stored hashed, and each user can hold at most 10 active keys (enforced in
  one insert statement, so parallel requests cannot exceed it). Every authenticated
  MCP request logs `mcp_request` with its request ID and key ID, and tool calls also
  log `mcp_tool_call` with the tool name (`unknown` for a name that is not a tool;
  never the secret or the arguments), so a key being abused can be found and
  revoked. The MCP routes are off on remote hosts unless
  `PERSONAL_RUN_MCP_ENABLED=true`. Revoking a key its owner already revoked
  succeeds with the original revoke time (a retry, or another tab); a missing key
  and another user's key get the same 404.
- **`/api/mcp` answers only known hosts** (DNS-rebinding defense in
  `functions/api/utils/agent-mcp-host.ts`): loopback hosts and the hosts in
  `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS`; any other host gets `403 Invalid Host`.
  Per-deployment URLs such as `https://<hash>.<project>.pages.dev` are never listed,
  so Agent Access asks the server which endpoint to show
  (`GET /api/agent-keys/connection`). On a host the check rejects, it shows the
  endpoint on the first configured origin with a note, or no endpoint when none is
  configured. Never widen the check to a `pages.dev` suffix.
- **Share links** (`/share/:token`) need no login, so the token is the only
  credential. `PUT /api/checklists/shared/:token` requires `expected_revision` and
  applies only completion, task notes, and status onto the stored run
  (`functions/api/utils/shared-run-merge.ts`); every other field is ignored.
  Because the token grants write access, run reads (lists, detail, archived,
  the share page) never return it or its timestamps
  (`serializeChecklistRun`), or a read-only Organization viewer could edit shared
  runs, and history lists never return the audit diffs
  where older rows may still hold it. Only the share-creation
  responses hand out a link, and they require permission to update the run.
  `GET /api/checklists/shared/:token` selects and returns a fixed field list
  (`sharedChecklistRunSelect` / `serializeSharedChecklistRun`): title, tasks,
  status, progress, timestamps, revision, and staleness. It never returns owner,
  member, Organization, or template ids (user ids resolve to names through
  `/api/profiles/by-id`) or notes on retired tasks.
  Link holders are guests: a signed-in visitor's edit is attributed to them only
  if they already belong to the run's owner context (the Personal owner or an
  active member of its Organization), and run history and the Organization
  activity feed hide any other share-link actor, including on older rows, so posting
  a link cannot be used to collect the names and emails of people who use it. Only the
  share-link rows are hidden; that person's other events keep their name
  (`functions/api/utils/share-link-actors.ts`).
- **Uploads** are written under the uploader's key prefix. Only an account's own
  avatar (`avatars/<userId>/<file>`, matched segment by segment) can be deleted.
  Template media cannot be deleted by anyone: Templates, versions, Runs and
  public-template clones may reference it, and uploads record no Personal or
  Organization owner, so the uploader (who may since have been disabled in or
  removed from the Organization) must not be able to break Organization content.
  Clearing or replacing template media only unlinks it (TD-19). Each bucket has a
  size limit (avatars 5MB, Template images, videos and files 50MB;
  `src/lib/schemas/uploadLimits.ts`, shared with the upload forms) and takes only
  the types listed in `src/lib/schemas/uploadTypes.ts`, which the upload pickers offer
  too (never HTML, SVG, XML, or scripts, since files are served from the app's origin).
  Browsers take a file's type from the OS, so one kind of file arrives under several
  types (Windows reports `.zip` as `application/x-zip-compressed`, and `.csv` as
  `application/vnd.ms-excel` when Excel is installed), and each kind lists them all. A
  file with no type, or the generic `application/octet-stream`, is typed from its
  extension, stored under the first type its kind lists, and rejected if that type is not
  allowed. The pickers' `accept` lists the extensions as well as the types, since Windows
  file pickers filter on extensions. Files are served as attachments, and every download
  is sent with `X-Content-Type-Options: nosniff`. There is no per-account storage
  quota yet (TD-18).
- **Invites** store only a token hash, never the raw token.
- **Public responses are allowlisted, not spread from a row.** Public Template
  responses use the fields in `functions/api/utils/template-public.ts`, so they
  never name an Organization or the members who edited a Template; add a field there
  only when visitors need it. The
  `/api/profiles/by-id` lookup resolves only Users who have a username
  ([system overview](design-docs/system-overview.md)).

## Secrets and environment

`.dev.vars` is the only local env file and holds local/test values only. `.env`
and `.env.local` are deprecated. Production values are Cloudflare Pages secrets.

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required. 32+ characters. `JWT_SECRET` is a legacy fallback with the same rule |
| `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID` | Required for Checkout |
| `STRIPE_WEBHOOK_SECRET` | Required only by the webhook endpoint |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Required for self-serve subscription management |
| `STRIPE_PRO_LEGACY_PRICE_IDS` | Optional, comma-separated; earlier Pro prices that still grant Pro after a price change |
| `RESEND_API_KEY` or `USESEND_API_KEY` | At least one, for verification and reset emails; otherwise auth-email actions return `503 auth_email_unavailable` |
| `EMAIL_FROM` | Optional sender override (default `noreply@mail.auth.serp.co`) |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | Optional CORS allowlist; also the remote hosts `/api/mcp` accepts. The first valid one (`FRONTEND_URL` first) is the MCP endpoint Agent Access shows on any other host |
| `R2_PUBLIC_BASE_URL` | Optional public file URL base |
| `ENTITLEMENTS_ADMIN_SECRET` | Optional; enables the admin override endpoint (below) |
| `PERSONAL_RUN_MCP_ENABLED`, `NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED` | Optional; enable Run Key and MCP routes on a remote host (on by default only for loopback hosts: `localhost`, `127.0.0.1`, `[::1]`; `false` turns them off there too) |

Rules:

- `pnpm run typecheck:env` and the runtime validate env the same way, with
  `@t3-oss/env-core` and Zod (`functions/api/env.ts`, `src/env.ts` for `NEXT_PUBLIC_`
  client variables, `emptyStringAsUndefined: true`). Next.js inlines a `NEXT_PUBLIC_` value
  into the browser bundle only where the code names it in full, so `src/env.ts` lists each
  one in `runtimeEnv` as `process.env.<NAME>`, never `process.env` as a whole. URL values
  are strictly validated so a malformed value cannot weaken CORS: `FRONTEND_URL` and every
  comma-separated `CORS_ALLOWED_ORIGINS` entry must be an `http(s)` URL with a real
  host (`functions/api/utils/origin-list.ts`, mirrored for the script in
  `scripts/lib/origin-list.mjs`, which `tests/unit/scripts/origin-list-parity.test.ts`
  keeps equal). A bare host (`serplists.com`), `host:port` with no scheme (which
  parses with the opaque origin `null`), a wildcard, a URL with credentials, or a list
  with no entries fails every request with the configuration `500`. A path or
  trailing slash is dropped, and empty entries (a trailing comma) are ignored.
- Invalid runtime configuration returns a structured JSON `500`, never an uncaught
  Cloudflare `1101`.
- Stripe live keys never enter `.dev.vars`: env validation rejects `sk_live_`
  values and `*_LIVE` names. Live Stripe administration takes keys injected into
  the process environment by an approved secret manager. `pnpm run
  stripe:local:scrub-live` removes production-only Stripe entries from a checkout.
- `pnpm run secret:scan` (secretlint) runs in CI and on staged files at commit.
  `scripts/secret-scan.mjs` scans every git-tracked file, or the files passed to
  it, as literal paths through secretlint's engine. The secretlint CLI would read
  route files such as `functions/api/[[route]].ts` as globs and skip them.
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
  reflected, and `OPTIONS` preflights from other origins get `403`. This holds even
  when the values are malformed and yield no valid origin: preflights skip env
  validation, so `cors.ts` fails closed on its own rather than treating the empty
  result as "no allowlist".
- `Origin: null` (sandboxed frames, `file:` pages) is never reflected, since it would
  be reflected with credentials, and the opaque `null` origin is never added to the
  allowlist or Better Auth's trusted origins.
- `X-Request-Id` is exposed to the client for correlation, and `Retry-After` so a
  cross-origin client (local development) can read how long a `429` lasts.

Locally, `pnpm run dev:all` passes its server's origin as `FRONTEND_URL` and adds it to
`CORS_ALLOWED_ORIGINS` for the port it picks (`scripts/lib/dev-bindings.mjs`).

## Secrets in URLs and third-party tags

The root layout loads the Google Tag Manager container from a script in `<head>`, and its
tags read the full page URL (GA4 sends it as `page_location`). So:

- The bootstrap skips the container for any document that opens on
  `/share/*`, `/team-invites/*` or `/reset-password`, or whose query has a `token`,
  `email`, `code` or `state` parameter, or a `next` return path
  (`src/lib/auth/returnPath.ts`) that points at one of those. The verification email
  returns a new invitee to `/login?verified=1&next=%2Fteam-invites%2F<token>`. The rule
  lives in `src/lib/analyticsUrl.ts`; the root layout inlines a copy
  (`src/lib/analytics/tagManagerBootstrap.ts`), and
  `tests/unit/security/gtmBootstrap.test.ts` checks that both agree.
- The app never puts an email address into a URL it navigates to, and puts a secret
  there only inside a `next` return path, which the rule above covers. Sign-up
  hands the new account's email to `/login` in sessionStorage, and the login page keeps
  it in its own history entry (`src/lib/auth/loginPrefill.ts`); the reset page reads its
  token once and removes it from the address bar (a reload offers a new link). When
  sign-in returns to an invite link in a document where the tags run, it loads the
  invite as a new page instead of navigating client-side.
- GA4 data redaction for email and the `token`/`email` query parameters is a useful
  second layer in the GA admin, but it cannot remove tokens in a path.

## Response headers

`next.config.ts` sets HSTS, `X-Frame-Options`, and the Content-Security-Policy on every
page and API response (`src/lib/http/securityHeaders.ts`), with the policy chosen by host
(below). Static files (the build's `/_next/static` files, fonts and images) are served by
Workers Static Assets without running the Worker, so each build writes `public/_headers` from
the same values
(`scripts/generate-static-headers.ts`, run by `pnpm run build`; the file is not committed).
`next dev` applies only `next.config.ts`, so check asset headers on `pnpm run preview` or a
deployed host. A build that is not production also marks every response and file
`X-Robots-Tag: noindex, nofollow` ([FRONTEND.md](FRONTEND.md#production-and-other-environments)).
Other hosts (`www`, `*.workers.dev`) never serve the site: they redirect to the
environment's one host ([RELIABILITY.md](RELIABILITY.md#environments-and-hosts)), so the
API's origin checks and Better Auth's reset and verification links only ever see that host
(and a workers.dev request carrying CI's `x-serplists-smoke-test` header, which is not a
secret). On `localhost` and `127.0.0.1` the policy leaves
out `upgrade-insecure-requests`: over plain http the browser would upgrade the redirects
the app's own navigations follow to https, which a local server does not serve.

- `frame-src` must list every video player origin in `EMBED_FRAME_ORIGINS`
  (`src/lib/utils/embedOrigins.ts`): YouTube, youtube-nocookie, and Clipy.
  `getVideoEmbedSource` frames only those origins; embed code from any other origin
  renders as an "Open video" link instead of a frame the browser would refuse.
- To support another provider, add its origin to both places.
  `tests/unit/security/headers.test.ts` fails when they drift, or when a bundled
  public template video would be blocked.
- `script-src` lists each third-party script origin by name, never `https:`:
  Google Tag Manager (the root layout), the Cloudflare Web Analytics beacon
  (`static.cloudflareinsights.com`, injected by Cloudflare) and Ahrefs Web Analytics
  (`analytics.ahrefs.com`, loaded by a GTM tag). A tag added in GTM that loads a
  script from a new origin needs that origin here, and in the list in
  `tests/unit/security/headers.test.ts`; otherwise the browser blocks it.
  `connect-src` already allows any `https:` host the beacons report to.

## Rate limits

Best-effort, per client IP, in `functions/api/[[route]].ts`, before Better Auth
dispatch. An IPv4 client is counted per address and an IPv6 client per /64
(`functions/api/utils/rate-limit-key.ts`), because a home connection, phone or VPS
normally holds a whole /64 and could otherwise start a fresh bucket with every
address. An IPv4-mapped address (`::ffff:203.0.113.5`) counts as its IPv4 address.
Clients that share a /64 (some office or campus networks) share one budget. A value
that does not parse as an address is keyed as it is, trimmed, so an odd header can
neither throw nor merge unrelated clients into one bucket, and the port that
`X-Forwarded-For` can carry in local development is dropped.

- Session checks (exactly `GET /api/auth/get-session` and `GET /api/auth/status`):
  600 requests per 5 minutes, in their own bucket, so page loads from a shared IP
  never lock signed-in users out or eat into the sign-in limit, and sign-in attempts
  cannot hide among them. Each check reads D1, so they are capped too.
- Every other `/api/auth/*` route (sign-in by email or username, sign-up, password
  reset, verification links, username checks, and any future Better Auth
  endpoint): 30 requests per 5 minutes on deployed hosts; 300 per hour locally for
  testing. This is deny-by-default: `functions/api/utils/auth-rate-limit.ts` matches
  the session-check allowlist on method and exact path, the path as `URL` parses it
  (no query string, dot segments resolved).
- Sensitive writes (`POST`/`PUT`/`PATCH`/`DELETE` under templates, checklists,
  uploads, the legacy Organization routes `teams`, and Run Key management under
  `agent-keys`): 120 per minute.
- Admin (every request under `/api/admin`, whatever its method): 10 per minute per IP
  on deployed hosts (120 locally, where local and browser-test runs share 127.0.0.1),
  in its own bucket. The endpoint checks a secret that
  grants plans without payment, so every request counts as a guess, reads included.
- MCP (`POST /api/mcp`): 240 per minute per IP, in its own bucket. MCP is JSON-RPC
  over POST, so every call counts, reads included; the separate bucket keeps a local
  agent from using up its owner's web saves on the same IP. It also counts calls
  with an unknown Run Key, each of which costs a D1 lookup. The `429` is a JSON-RPC
  error (`code: -32000`, `Rate limit exceeded`) with `Retry-After`.
- Billing checkout and portal (`POST /api/billing/*`), which each call Stripe, whose
  rate limit the whole Stripe account shares: 10 per minute per IP on deployed hosts
  (120 locally, as for admin), in their own bucket, and 10 per minute per account in
  the billing handler whatever the IP. `GET /api/billing/status` and Stripe webhooks
  are never limited.
- `functions/api/utils/route-rate-limit.ts` holds the non-auth buckets. Every route
  family the router dispatches is either limited there or listed in
  `RATE_LIMIT_EXEMPT_ROUTES` with a reason; a unit test reads the router to check.
  Its prefixes match the router's own dispatch (`path.startsWith`), so every request a
  handler receives is counted.
- MCP also limits each authenticated Run Key to 120 requests per minute
  (`RUN_KEY_REQUESTS_PER_MINUTE`, which the per-IP MCP limit doubles), so one key's
  full budget always fits under the per-IP MCP limit, and refuses an IP after 10
  failed authentications in a minute, before the D1 key lookup
  (`functions/api/utils/mcp-limits.ts`): an invalid key cannot be limited per key,
  and each lookup reads D1.
- Cloudflare WAF rate-limiting rule `MCP rate limit` (zone `serplists.com`, Free plan,
  the zone's only rate-limiting slot): `http.host eq "serplists.com" and
  starts_with(http.request.uri.path, "/api/mcp")`, 20 requests per 10 seconds per IP,
  then Block for 10 seconds. Unlike the in-memory limits, it applies across all edges.
- Password-reset and verification emails are also limited per account, whatever
  the IP, so a request loop can neither flood an inbox nor spend the email
  provider's quota: at most one of each kind a minute and five an hour
  (`functions/api/utils/auth-email-throttle.ts`, called from the Better Auth send
  callbacks). The count is one primary-key upsert in D1 (a `verification` row with
  id `auth-email-throttle:<kind>:<userId>`, which no Better Auth lookup reads), so it
  holds across edges and concurrent requests. The row's `value` counts the window's
  sends, `expires_at` ends the window (Better Auth's expired-row cleanup then deletes
  it) and `updated_at` is the last send. A skipped send returns the same response as
  a sent one, and the unused reset token is deleted: Better Auth stores it before it
  calls the send callback, so every throttled request would otherwise leave a row
  nobody can use. A send the provider rejects does not count, so the person can retry
  at once. Verification emails are never sent to an address that is already verified.
  If D1 fails, the email is sent (fail open), so a database problem never blocks
  sign-up or password recovery.

The limiter is a fixed-window counter per key in an in-memory map
(`functions/api/utils/rate-limit.ts`), so it is not consistent across Cloudflare
edges, and it and the MCP failed-authentication count are skipped for a request with neither
`CF-Connecting-IP` nor `X-Forwarded-For` (which local development sends instead).
Each isolate keeps at most 10,000 keys (about 2MB), so a flood of new addresses
cannot exhaust its memory. When a new key arrives at a full map, every expired window
is dropped first (each key's own window: the buckets' windows differ, so insertion
order is not expiry order), then the oldest ones, a renewed window counting as new,
keeping clients that are currently blocked while any other can go. Each pass makes
room down to 90% of the cap, so a flood costs one pass per thousand or so new keys
rather than one per request. An evicted client starts a new window (fail open):
anyone who can fill the map already controls enough addresses to get around a per-IP
limit. A `429` during intensive local QA means the limit, not broken credentials.

## Request size limits

Request bodies are capped in the router before any handler runs
(`functions/api/utils/body-limit.ts`), for every `POST`/`PUT`/`PATCH`/`DELETE`
whatever the `Content-Type`, because handlers parse JSON without checking it: 1MB by
default, 16KB for `/api/auth/*` (sign-in, sign-up and profile bodies are a few hundred
bytes, so an oversized value stops before Better Auth parses it), 2MB for Template
backups, and 50MB (plus 1MB for the multipart envelope) for uploads. Template and run
content has its own, smaller limit (`src/lib/schemas/contentLimits.ts`,
`413 content_too_large`): 768KB for a Template, and 896KB for a run, which holds its
Template's content plus notes. Every save sends the whole content back (the editor's Save,
and a run page's every tick, note and completion), so no write stores content too large for
its save route to accept again, with room for the request's other fields; an import, whose
request holds several Templates, checks each one. Content is measured as the app sends it
back (`contentSaveBytes`): loading and saving fill in what a stored record may lack (ids,
titles, descriptions, content lists, block values and completion), so the stored JSON alone
would undercount content that was imported or written by hand. A save no larger than the
content it replaces is allowed, so content stored before the limit can still be saved and
trimmed.
The MCP endpoint (`/api/mcp`) checks its own 1MB body limit too, and bounds what it returns.
Every tool result stays within 32KB (`MAX_RESULT_BYTES` in
`functions/api/handlers/agentMcpPages.ts`), which MCP clients take whole: Claude
Code sets a result over 25,000 tokens aside in a file, and Codex cuts the middle out of one
over 48,000 bytes. `get_template` and `get_run` read a larger template or run a part at a
time, `list_templates` and `list_runs` return a page at a time with a cursor to the next, and
`update_template` operations and `update_run` change one section or task, so no call returns a
whole large template or run, and no edit needs one sent back. MCP run writes keep the same
content limit as the web app's, and `update_run` refuses task notes over 20,000 characters or
30KB of UTF-8 (`MAX_TASK_NOTES_BYTES` in `functions/api/handlers/agentMcpTools.ts`), so notes an
agent writes come back in one result.
The cap uses `Content-Length`, or counts the bytes of a clone of the body when it is
missing or malformed, which buffers at most the cap. The count never waits for the
clone's cancel: cancelling one branch of a cloned (teed) body settles only once the
other branch is cancelled too, so waiting would hang every oversized request. Uploads
are the exception: counting would buffer up to 51MB, and the
upload handler's form parsing reads the whole body before it can check the file
size, so an upload without a valid `Content-Length` (a chunked body) gets `411`
before the handler runs. Browsers always send one for `FormData` uploads. The
unauthenticated shared Run update checks its share token before reading the body.

## Admin entitlement override

`POST /api/admin/entitlements/override` grants or revokes Pro without Stripe (comps,
debugging), authenticated by the `X-Admin-Secret` header. Because it bypasses
billing, keep it disabled by default:

1. Confirm the `entitlement_overrides` table exists (normal migration checks).
2. Generate a random `ENTITLEMENTS_ADMIN_SECRET` (for example `openssl rand -base64 32`;
   never a memorable word), add it as a temporary Pages secret, and redeploy.
3. Apply the override, then verify the D1 row and `GET /api/billing/status` for
   the user rather than trusting the command response.
4. Remove the secret, redeploy, and confirm a `POST` to the endpoint returns `401`.

Only `POST` and `DELETE` on `/api/admin/entitlements/override` read the secret: any
other method there gets `405` (with `Allow: POST, DELETE`) and any other path under
`/api/admin` gets `404`, whatever the header holds, so no other request can test a
guess. The secret is compared as SHA-256 digests, in full, so the time a check takes
reveals neither how much of a guess matched nor how long the secret is.

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

An active `"free"` override closes self-serve checkout: `POST /api/billing/checkout`
returns `409 plan_managed_by_support` and Billing shows that support manages the plan,
until the override is deleted or expires (a `"pro"` override already returns
`409 already_subscribed`). A `"free"` override does not cancel an
existing Stripe subscription, which keeps billing: cancel it in Stripe (the user can
also still open the Customer Portal). A `"pro"` comp creates no Stripe customer, so
Billing shows that support manages the plan instead of Manage subscription, and the
portal returns `409 no_billing_account`. To end a comp, prefer `DELETE`, which returns the
user to their Stripe state.
