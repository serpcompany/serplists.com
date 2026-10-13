---
status: proposed
---

# Report errors to Workers Logs

Staging's and Production's errors go to Cloudflare's Workers Logs, where the Worker already writes
its JSON log lines, and nowhere else. The Worker logs its own errors through `log()`, each line
naming the commit it was built from. The browser reports its errors to `POST /api/client-errors`:
the error's name and stack frames, never its message, rebuilt from their parts before it sends
them, and the API rebuilds each report again and logs it as one `client_error` line. An agent
reads both with `pnpm run logs:deployed`. SERP's Telemetry standard starts a website with Sentry
in the front and back end; this repository does not use it yet.

Chosen with the harness alignment on 2026-10-12 as the interim that needs no new account or
processor, for the owner to accept or to replace with Sentry, which needs an account and a DSN
only the owner can create. The guide's default is SERP's (Sentry in every app), and its variant of
platform tools only applies when a published privacy promise rules an SDK out; this repository had
published none. How it works is in
[`observability.md`](../agents/observability.md#error-reports), and what a report holds in
[privacy](../product/privacy.md#error-reports).

## Why

- **One place to look.** The Worker's errors were already in Workers Logs. Reports from the
  browser beside them, each naming the commit its page was built from, let one query show a
  failure from both ends, and one read-only command reads it for Staging and for Production.
- **No new company gets the data.** Workers Logs is part of the Cloudflare account that already
  serves the site and holds its data, so error reports add no processor to what the privacy doc
  lists, no new script origin to the Content-Security-Policy, and no SDK to the page.
- **Small and inspectable.** The reporter is a few dozen lines the repository owns and tests:
  what a report holds, how it is rebuilt, and how often it is sent are all in code an agent can
  read and change, and a failed report never breaks a page.
- **Nothing to pay or set up.** Workers Logs is included with the Workers plan and already on
  (`[observability]` in `wrangler.toml`).

## Considered

- **Sentry in the browser and the Worker,** SERP's default for websites: grouping, alerts, release
  health and source maps out of the box, but a third-party processor and an SDK in every page, a
  project and a DSN to keep per environment, and a plan to pay for once volume grows.
- **PostHog,** whose error tracking comes with product analytics: the same new processor, and SERP's
  standard keeps analytics apart from error reporting in code and consent.
- **Nothing,** as before: browser errors reached only the console of the person who hit them, so
  no one, agent or person, could see why a page failed for someone else.

## Consequences

- A report holds no message, only the error's name and its frames, so it can't carry what someone
  typed or a Template's content; finding the cause takes the frames and the commit. The frames are
  rebuilt in the browser and in the API (`scrubClientErrorReport`), whose tests list what they keep.
- An error a root error boundary catches is always reported. A window error or unhandled rejection
  is reported only when a frame of its stack is in the site's own scripts (for a window error whose
  stack names no frame, the place the window says it was thrown), so an error in an inline script
  or a third-party tag is never seen, nor a rejected error whose stack names no frame, such as the
  `TypeError` of a failed `fetch`, which the API client passes on as it is.
- Workers Logs keeps lines for 3 days on the Workers Free plan and 7 on Workers Paid, so an error is
  read within that window or lost.
- There is no grouping, alerting or release health: `logs:deployed` filters and prints lines, and
  `logs:query`'s groupings work only on local logs. A failed deploy is reported apart from this:
  CI's `deploy-failed` job opens, or comments on, a "Staging deploy failed" or "Production deploy
  failed" issue.
- No source maps are kept, so a browser stack names the minified chunks; finding the code means
  building the reported commit.
- Reading the logs needs a Cloudflare API token that only reaches Workers Observability, which an
  owner makes.
- Moving to Sentry later changes the privacy doc first, then adds its SDK beside the reporter or in
  its place; the report's fields and the release identifier carry over.
