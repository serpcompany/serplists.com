# Privacy

What SERP Lists collects from the people who use it, why, how long it keeps it, and how to opt out
or ask for deletion, as the code and configuration have it today. serplists.com has no privacy
policy page yet; this doc is what one would be written from. A change that collects something
new, keeps something longer, or sends it somewhere new changes this doc in the same pull request,
before it ships.

Abbreviations: **Analytics privacy spec** is `tests/e2e/analytics-privacy.spec.ts`, **Tag Manager
tests** is `tests/unit/security/gtmBootstrap.test.ts`, **Header tests** is
`tests/unit/security/headers.test.ts`, **In-memory analytics tests** is
`tests/unit/lib/analytics.dom.test.tsx`, **Video tests** is `tests/unit/utils/urlHelpers.test.ts`,
**Report scrubbing tests** is `tests/unit/lib/schemas/clientErrorReport.test.ts`, **Browser reporter
tests** is `tests/unit/lib/errorReports.dom.test.tsx`, **Error report route tests** is
`tests/unit/functions/api/client-errors.test.ts`, **Logger tests** is
`tests/unit/functions/api/logger.test.ts`, **Router log tests** is
`tests/unit/functions/api/router-logging-pii.test.ts`, **Better Auth log tests** is
`tests/unit/functions/api/better-auth-logger.test.ts`, **Password reset tests** is
`tests/unit/functions/api/password-reset-sessions.test.ts`, **Audit tests** is
`tests/unit/functions/api/audit.test.ts`, **Email throttle tests** is
`tests/unit/functions/api/auth-email-throttle.test.ts`, **Billing tests** is
`tests/unit/functions/api/billing-handler.test.ts`, **Upload tests** is
`tests/unit/functions/api/uploads-handler.test.ts`, **Sidebar tests** is
`tests/unit/components/ui/sidebar-provider.dom.test.tsx`, **Theme tests** is
`tests/unit/lib/theme.test.ts`, **View mode tests** is `tests/unit/lib/viewModePreference.test.ts`,
**Context spec** is `tests/e2e/organization-routes.spec.ts`, **Session sync tests** is
`tests/unit/contexts/sessionSync.tabs.test.ts`, **Guest run tests** is
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

**What the container runs.** Its tags are set in Google Tag Manager's interface, not in this
repository, and the owner keeps them ([harness debt](../harness-debt.md)). Its live version
(version 4, read from its public `gtm.js` on 2026-10-12) runs two tags as soon as it loads
(`gtm.init`): Google Analytics 4 and the Ahrefs loader, below. A tag added there collects data
with no pull request, so whoever adds one updates this doc. Scripts load only from Tag Manager
(`www.googletagmanager.com`, which serves Google Analytics' tag too), Ahrefs and Cloudflare's
beacon: the Content-Security-Policy blocks any other origin until it, its test and this doc name it.

- No automated check yet (issue to come: unchecked product behaviors).
- Check: Header tests, "allows every analytics script origin in script-src, and no wildcard, while
  connect-src lets the beacons report to their own hosts".

**Google Analytics 4 (`G-DHCEX32521`).** To count visits and see where they come from, Google's
tag sends a page view for each page: the full page URL (`page_location`), the referrer and the
title, with the browser's IP address and an id it keeps in two first-party cookies, `_ga` and
`_ga_DHCEX32521`, for two years by default
([Google's list](https://support.google.com/analytics/answer/11397207)). How long Google keeps the
data is a Google Analytics setting the owner keeps. To opt out, use Google's
[opt-out add-on](https://tools.google.com/dlpage/gaoptout) or block `www.googletagmanager.com`.

- No automated check yet (issue to come: unchecked product behaviors).

**Ahrefs Web Analytics.** The second tag adds Ahrefs' script, which sends Ahrefs each page view's
full URL and referrer, to count visits; the script sets no cookie and uses no browser storage. How
long Ahrefs keeps it is Ahrefs' setting, not known here. Blocking `analytics.ahrefs.com` stops it.

- No automated check yet (issue to come: unchecked product behaviors).

**Never where the URL holds a secret.** The tags read the full page URL, so the container is
skipped on a page opened at `/share/`, `/team-invites/` or `/reset-password`, or whose query has
`token`, `email`, `code`, `state` or a `next` return path to one of those
(`src/lib/analyticsUrl.ts`). The reset page takes its token out of the address bar, and the login
page an email address. Tag Manager's `noscript` frame gets only the site's origin as referrer.

- Check: Analytics privacy spec, "analytics privacy".

**Cloudflare Web Analytics.** Cloudflare can add its beacon (`static.cloudflareinsights.com`) to the
pages it serves; it counts visits and page speed without cookies. Whether it runs is a setting of
the `serplists.com` zone, not of this repository.

- No automated check yet (issue to come: unchecked product behaviors).

**Opting out.** The product has no setting or consent banner for any of these. Blocking the Tag
Manager, Google Analytics, Ahrefs and Cloudflare Insights hosts stops them; pages work the same.

- No automated check yet (issue to come: unchecked product behaviors).

**In-memory events.** `src/lib/analytics.ts` keeps up to 100 events (page views and Template views)
in the tab's memory and prints them to the browser console. It sends nothing.

- Check: In-memory analytics tests, "keeps at most 100 events in the tab's memory and sends none of
  them anywhere".

## Videos and media in Templates

**YouTube.** A video block with a YouTube link plays in YouTube's player, framed from
`www.youtube.com`, or from `www.youtube-nocookie.com` only when the link used that host
(`getVideoEmbedSource` in `src/utils/urlHelpers.ts`). The frame loads when the block shows, before
anyone presses play, on every environment: YouTube gets the browser's IP address and the site's
origin, and sets its own cookies under its privacy policy. Blocking `youtube.com` stops it; the
video doesn't play, and the rest of the page works.

- Check: Video tests, "embeds the YouTube player for %s".

**Clipy.** A Clipy link plays in Clipy's player, framed from `clipy.online` with `ref` and
`utm_source=serplists.com` added to its address, beside a "Watch on Clipy" link. Clipy gets what
YouTube does; its cookies and how long it keeps data are Clipy's, not known here. Blocking
`clipy.online` stops it. A page frames only these players and Tag Manager (the policy's
`frame-src`), so embed code for any other player shows as an "Open video" link.

- Check: Video tests, "turns a Clipy watch URL into its iframe player URL".
- Check: Header tests, "only frames video sources that the policy allows".

**Images and video files.** A Template's author can link an image or a video file on any https
host, which the browser then loads from that host, sending it the IP address and the site's origin.
Files uploaded to a Template come from the site's own origin ([uploads](#uploads)).

- Check: Video tests, "keeps direct video files in the native player path".

## Error reports

**What a report holds, and why.** When a page fails into a root error boundary, or the window
reports an uncaught error or unhandled rejection from the site's own scripts, the browser sends
`POST /api/client-errors`, so the failure can be found and fixed: where it came from, the error's
name, the stack's frames (each one's function, script path, line and column), the page's path and
the commit it was built from ([observability](../agents/observability.md#error-reports)). It
sends no message, which can quote what someone typed or a Template's content, and no form input,
storage, account id or IP address, to the site's own origin, without cookies. Reports are never
used for analytics.

- Check: Browser reporter tests, "reports an error thrown by the site's own scripts with its name,
  frames, page path and release, and never its message" and "posts a report to /api/client-errors
  as JSON, kept alive past the page and sent without cookies or message".

**Rebuilt twice.** The browser rebuilds each frame from its parts before it sends a report, and the
API again before it logs it: a line that is not a frame is dropped, however many lines a message
runs to; a frame loses its query and fragment, and names a script on the page's origin by its
path, another origin's by origin and path, and an extension's by its scheme alone; a secret in a
share, invite or reset path becomes `:token`, and an email address `[email]`. A name that is not
an identifier is dropped, and each field is cut to its bound before any pattern reads it.

- Check: Report scrubbing tests, "sends no message text: drops a stack's message lines, however
  many, and keeps each frame's function, file, line and column", "keeps another origin's frame
  with its origin, and a browser extension's with its scheme alone" and "writes the secret in an
  inline script's page as :token, and an email address as [email], as in the page's path".

**Only the site's own code, and few.** A window error or rejection is reported only when a frame
of its stack is in the site's own scripts (`/_next/static/`), never from a browser extension, a
third-party script, an inline one (as Tag Manager's Custom HTML tags are) or the browser's
`Script error.`. A page load sends at most five reports and an error that repeats once.

- Check: Browser reporter tests, "leaves out an error from %s", "reports an unhandled rejection
  only when its stack runs through the site's scripts" and "sends at most five reports a page
  load, and an error that repeats once".

**Where it goes, and for how long.** The API writes one `client_error` line to Workers Logs, which
keeps it as long as [any log line](#server-logs), and answers 204. It takes a report only as JSON
from the site's own origins, and 10 a minute from one client.

- Check: Error report route tests, "logs one client_error line of the report's frames, path and
  commits, never a message, and answers 204 with no body" and "takes 10 reports a minute from a
  client, in a budget of its own, so a burst of reports never blocks a save".

**Opting out.** There is no setting for it. Blocking `/api/client-errors` in the browser stops the
reports, and a report that can't be sent never breaks the page.

- Check: Browser reporter tests, "never lets a report that fails break the page".

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

**How long.** Staging's and Production's lines, error reports among them, stay in Cloudflare's
Workers Logs for 3 days on the Workers Free plan and 7 on Workers Paid, then go
([limits](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#limits)),
as does Cloudflare's own record of each request, which includes its full URL. Only people with
access to SERP's Cloudflare account, or a token for its Workers Observability, can read them.

- No automated check yet (issue to come: unchecked product behaviors).

## Accounts

**What an account keeps.** The email address, the password (hashed by Better Auth), the name,
username and display name, the avatar, and what the person makes: Templates, Runs, Organizations
and their memberships, and Run Keys, which are stored hashed. They are kept while the account
exists, so the person can use them.

- No automated check yet (issue to come: unchecked product behaviors).

**Sessions.** Signing in sets Better Auth's session cookie (`better-auth.session_token`,
`__Secure-` on https; httpOnly, SameSite=Lax). The session, stored in D1 with the browser's IP
address and user agent, lasts 7 days and is extended while it is used. Signing out ends it, and a
password reset ends every session of the account.

- Check: Password reset tests, "signs out every existing session, including a hijacked one".

**Activity.** Changes to Templates, Runs and Organizations are recorded in D1 with who made them,
what changed (form answers by task only), the request id, an unsalted SHA-256 hash of the IP
address and the browser's user agent, and kept with the record.

- Check: Audit tests, "records the request id, a SHA-256 hash of the client's IP address and the
  user agent, never the address itself".

**Deletion.** The product has no way to delete an account yet. A person asks at
support@serplists.com, the address on the Contact page.

- No automated check yet (issue to come: unchecked product behaviors).

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

The browser sends a site's cookies with every request to it, so Production's Google Analytics
cookies ([above](#analytics)) reach SERP Lists too; browser storage never leaves the browser.
Clearing the site's data removes them all. Besides the session cookie above:

**The sidebar.** The `sidebar_state` cookie records whether the console sidebar was last opened or
closed, for 7 days. The browser sends it with every request to SERP Lists, though nothing reads it
today, so the sidebar opens the same either way.

- Check: Sidebar tests, "writes the sidebar_state cookie for the whole site for 7 days when the
  sidebar opens or closes, and no other cookie".

**The theme.** `serplists-theme` in localStorage keeps light or dark.

- Check: Theme tests, "toggles the document dark class and persists the selected theme".

**Card or row views.** `serplists:view-mode:...` in localStorage keeps each screen's view for each
user.

- Check: View mode tests, "scopes each preference to the user and screen".

**The context.** `serplists.activeWorkspaceId` in localStorage keeps the last Personal or
Organization context, and `serplists.sessionChanged` tells other tabs of a sign-in or sign-out.

- Check: Context spec, "a Personal URL shows Personal in a tab that remembered an Organization, and
  becomes the remembered context".
- Check: Session sync tests, "falls back to storage events when BroadcastChannel is missing, and
  ignores malformed values".

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
