# Privacy

What SERP Lists collects from the people who use it, why, how long it keeps it, and how to opt out
or ask for deletion, as the code and configuration have it today. serplists.com has no privacy
policy page yet; this doc is what one would be written from. A change that collects something
new, keeps something longer, or sends it somewhere new changes this doc in the same pull request,
before it ships.

Abbreviations: **Analytics privacy spec** is `tests/e2e/analytics-privacy.spec.ts`, **Tag Manager
tests** is `tests/unit/security/gtmBootstrap.test.ts`, **Header tests** is
`tests/unit/security/headers.test.ts`, **Report scrubbing tests** is
`tests/unit/lib/schemas/clientErrorReport.test.ts`, **Browser reporter tests** is
`tests/unit/lib/errorReports.dom.test.tsx`, **Error report route tests** is
`tests/unit/functions/api/client-errors.test.ts`, **Logger tests** is
`tests/unit/functions/api/logger.test.ts`, **Router log tests** is
`tests/unit/functions/api/router-logging-pii.test.ts`, **Better Auth log tests** is
`tests/unit/functions/api/better-auth-logger.test.ts`, **Password reset tests** is
`tests/unit/functions/api/password-reset-sessions.test.ts`, **Email throttle tests** is
`tests/unit/functions/api/auth-email-throttle.test.ts`, **Billing tests** is
`tests/unit/functions/api/billing-handler.test.ts`, **Upload tests** is
`tests/unit/functions/api/uploads-handler.test.ts`, **Theme tests** is `tests/unit/lib/theme.test.ts`,
**View mode tests** is `tests/unit/lib/viewModePreference.test.ts`, **Guest run tests** is
`tests/unit/features/guest-runs/guestRunStore.test.ts`, **Login handoff tests** is
`tests/unit/lib/auth/loginPrefill.test.ts`, **Draft tests** is
`tests/unit/features/template-editor/templateDraftStore.test.ts`, and **Note draft tests** is
`tests/unit/features/run-execution/keptNoteDrafts.test.ts`.

## Analytics

**Google Tag Manager, on Production only.** A build with `SITE_ENV=production` renders the Tag
Manager container `GTM-PZZFQBGG` in every page's head (`src/app/layout.tsx`). Staging and local
builds load none, whatever host serves them.

- Check: Tag Manager tests, "loads the container only where SITE_ENV=production, never on staging
  or a local build, whatever host serves it".

**What the container loads.** Its tags are set in Google Tag Manager, outside this repository; the
one recorded here loads Ahrefs Web Analytics, which counts visits. The Content-Security-Policy lets
scripts load only from Tag Manager, Ahrefs (`analytics.ahrefs.com`) and Cloudflare's Web Analytics
beacon, so a tag that loads from anywhere else is blocked until the policy, its test and this doc
name it.

- Check: Header tests, "allows every analytics script origin in script-src, and no wildcard, while
  connect-src lets the beacons report to their own hosts".

**Never where the URL holds a secret.** The tags read the full page URL, so the container is
skipped on any page opened at `/share/`, `/team-invites/` or `/reset-password`, or whose query has
`token`, `email`, `code` or `state`, or a `next` return path to one of those
(`src/lib/analyticsUrl.ts`). The reset page takes its token out of the address bar, and the login
page an email address. With JavaScript off, Tag Manager's `noscript` frame gets only the site's
origin as its referrer (`Referrer-Policy: strict-origin-when-cross-origin`).

- Check: Analytics privacy spec, "analytics privacy".

**Cloudflare Web Analytics.** Cloudflare can add its beacon (`static.cloudflareinsights.com`) to the
pages it serves; it counts visits and page speed without cookies. Whether it runs is a setting of
the `serplists.com` zone, not of this repository.

- No automated check yet.

**In-memory events.** `src/lib/analytics.ts` keeps up to 100 events (page views and Template views)
in the tab's memory and prints them to the browser console. It sends nothing.

- No automated check yet.

**Opting out.** The product has no setting for it. Blocking the Tag Manager, Ahrefs and Cloudflare
Insights hosts in the browser stops all three, and every page works the same without them.

- No automated check yet.

## Error reports

**What a report holds.** When a page fails into one of the root error boundaries, or the window
reports an uncaught error or unhandled rejection from the site's own scripts, the browser sends
`POST /api/client-errors` once: where the error came from, its name, message and stack, the page's
path without its query or fragment, and the commit the page was built from
([observability](../agents/observability.md#error-reports)). It goes to the site's own origin
without cookies, and holds no form input, browser storage, account id or IP address.

- Check: Browser reporter tests, "posts a report to /api/client-errors as JSON, kept alive past the
  page and sent without cookies".

**Scrubbed twice.** The browser scrubs a report before it sends it and the API again before it logs
it: queries and fragments are dropped, the secret in a share, invite or reset path is written as
`:token`, email addresses as `[email]`, and bearer tokens, web tokens and long random strings (Run
Keys, session tokens, ids that may be share tokens) as `[token]`. Each field is cut to a bound.

- Check: Report scrubbing tests, "scrubClientErrorReport, which runs in the browser before a report
  is sent and in the API before it is logged".

**Few, and never in the way.** A page load sends at most five reports and an error that repeats
once, nothing from another origin (a browser extension, a third-party tag), and a report that fails
never breaks the page.

- Check: Browser reporter tests, "sends at most five reports a page load, and an error that repeats
  once", "leaves out an error from %s" and "never lets a report that fails break the page".

**Where it goes.** The API writes one `client_error` line to Workers Logs and answers 204. It takes
a report only as JSON from the site's own origins, and 10 a minute from one client.

- Check: Error report route tests, "logs one client_error line from the report, scrubbed, and
  answers 204 with no body" and "takes 10 reports a minute from a client, in a budget of its own,
  so a burst of reports never blocks a save".

## Server logs

**What the API logs.** Each request's method, path, status and duration under a request id, and
named events for errors and actions, as JSON lines (`functions/api/utils/logger.ts`). A field named
`ip`, `email`, `password`, `token`, `authorization` or `cookie` is written as `[redacted]`, and a
failed query's values are dropped.

- Check: Logger tests, "redacts personal data and secrets whatever the key casing" and "drops
  Drizzle query parameters from any field, as an error or as its message".

**No IP addresses.** The API keeps a client's IP address in memory for rate limits only, and never
logs it.

- Check: Router log tests, "keeps the client IP out of the request log".

**No email addresses from sign-in.** Better Auth's own messages, which name the address on an
unknown sign-in, reset or repeat sign-up, are logged with the address taken out.

- Check: Better Auth log tests, "keeps email addresses out of the logs for unknown sign-ins, resets
  and repeat sign-ups".

**How long.** Staging's and Production's lines stay in Cloudflare's Workers Logs for 3 days on the
Workers Free plan and 7 on Workers Paid, beside Cloudflare's own record of each request, which
includes its full URL. Only people with access to SERP's Cloudflare account, or a token for its
Workers Observability, can read them (`pnpm run logs:deployed`).

- No automated check yet.

## Accounts

**What an account keeps.** The email address, the password (hashed by Better Auth), the name,
username and display name, the avatar, and what the person makes: Templates, Runs, Organizations
and their memberships, and Run Keys, which are stored hashed. They are kept while the account
exists, so the person can use them.

- No automated check yet.

**Sessions.** Signing in sets Better Auth's session cookie (`better-auth.session_token`,
`__Secure-` on https; httpOnly, SameSite=Lax). The session, stored in D1 with the browser's IP
address and user agent, lasts 7 days and is extended while it is used. Signing out ends it, and a
password reset ends every session of the account.

- Check: Password reset tests, "signs out every existing session, including a hijacked one".

**Activity.** Changes to Templates, Runs and Organizations are recorded in D1 with who made them,
what changed (form answers by task only), the request id, a SHA-256 hash of the IP address and
the browser's user agent, and kept with the record.

- No automated check yet.

**Deletion.** The product has no way to delete an account yet. A person asks at
support@serplists.com, the address on the Contact page.

- No automated check yet.

## Email and billing

**Only account emails.** SERP Lists emails only to verify an address and to reset a password, from
`noreply@mail.auth.serp.co` through Resend or useSend, at most one of each a minute and five an
hour for an account. Organization invites are links the inviter shares, not emails.

- Check: Email throttle tests, "sends one reset email a minute and keeps no token for a skipped
  one" and "sends at most five reset emails an hour, then allows more in the next hour".

**Stripe.** Checkout and the Customer Portal are Stripe's pages, so card details go to Stripe and
never reach SERP Lists. SERP Lists makes the Stripe customer with the account's email address and
id, and keeps the customer and subscription ids and the plan's status.

- Check: Billing tests, "creates the Stripe customer with a per-account idempotency key ending in a
  digest of the email, so a changed email gets a new customer".

## Uploads

**Files people add.** Avatars and Template images, videos and files are stored in R2, one bucket
for each environment, under the uploader's id, and served from the site's own origin
([database operations](../agents/database-operations.md#r2-uploads)). An account can delete its own
avatar. Template media stays, since copies of a Template, its versions and its Runs may use it.

- Check: Upload tests, "lets an account delete its own avatar".

## Cookies and browser storage

None of these leave the browser except the session cookie, which goes only to SERP Lists. Clearing
the site's data removes them all.

**The sidebar.** The `sidebar_state` cookie keeps the console sidebar open or closed for 7 days.

- No automated check yet.

**The theme.** `serplists-theme` in localStorage keeps light or dark.

- Check: Theme tests, "toggles the document dark class and persists the selected theme".

**Card or row views.** `serplists:view-mode:...` in localStorage keeps each screen's view for each
user.

- Check: View mode tests, "scopes each preference to the user and screen".

**The context.** `serplists.activeWorkspaceId` in localStorage keeps the last Personal or
Organization context, and `serplists.sessionChanged` tells other tabs of a sign-in or sign-out.

- No automated check yet.

**Guest Runs.** `serplists:guest-run:<Template>` in localStorage keeps a signed-out visitor's Run of
a public Template until it is saved into an account or replaced.

- Check: Guest run tests, "stores ticks, notes and completion with the next revision".

**The sign-up handoff.** `serplists:login-email` in sessionStorage hands a new account's email
address from sign-up to sign-in, once, so it never enters a URL.

- Check: Login handoff tests, "hands the address to the login page once".

**Unsaved Template edits.** `serplists:template-draft:...` and `serplists:template-edit-draft:...`
in sessionStorage keep the editor's unsaved changes for the tab, for one user and context.

- Check: Draft tests, "never restores a draft into another user or context".

**Unsaved task notes.** `serplists:run-note-drafts:...` in sessionStorage keeps notes typed when a
session ends, to offer back after sign-in.

- Check: Note draft tests, "gives the drafts back once, for the same user and run".
