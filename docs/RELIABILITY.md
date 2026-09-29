# Reliability

How changes are verified, shipped, observed, and recovered. Database environments,
migrations, backups, and R2 storage are in
[design-docs/database-operations.md](design-docs/database-operations.md).

## Principles

- Every check runs in CI, and nothing deploys unless every check passes.
- Deploys fail closed: pending D1 migrations or a failed probe of the new
  deployment stop the release.
- Preview deployments never touch production data.
- Schema changes go through Wrangler migrations only, never ad hoc remote SQL.
- If an incident starts right after a deploy, roll back first and debug second.

## Quality gates

| Where | What runs |
| --- | --- |
| Pre-commit hook | Secret scan and ESLint on staged files |
| Pre-push hook | `pnpm run verify` |
| `pnpm run verify` | Env contract, lint, `tsc -b`, `check:repo` (secrets, docs, architecture, generated artifacts), unit tests |
| CI Quality Gate | `verify` steps plus local D1 fixture tests, build, and browser tests: smoke on every PR, the full suite on PRs into `main` |
| CI schema parity | Replays every migration and compares it with the Drizzle schema |
| Claude code review | Advisory inline review comments on every non-draft PR; never blocks merging ([agent workflow](design-docs/agent-workflow.md#claude-code-review)) |
| Before a release | `pnpm run verify:release` locally; `pnpm run verify:staging` or `pnpm run verify:prod:d1` for remote D1 readiness (needs Cloudflare credentials) |

Lefthook hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. When a CI failure looks flaky,
re-run once. If it fails again, treat it as real, and record genuinely flaky tests
in the [tech debt tracker](exec-plans/tech-debt-tracker.md).

## Deploy pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and
`staging`. On pushes (or a manual run with "deploy" checked), its deploy job calls
the reusable `.github/workflows/cloudflare-pages-deploy.yml` after both check jobs
pass. The deploy workflow:

1. validates the env contract with a placeholder `BETTER_AUTH_SECRET` (the real
   secret lives only in Cloudflare Pages)
2. blocks on pending D1 migrations: `pnpm run verify:prod:d1` for `main`,
   `pnpm run verify:staging` for other branches
3. builds with full git history (`fetch-depth: 0`), because sitemap `lastmod`
   values come from `git log`; a shallow clone would stamp every page with the
   deploy date, so `sitemap:generate` fails on one in CI. Each bundled Template is
   dated by the newest commit on the built branch (first-parent) that changed its
   content, read from the pack history (`scripts/lib/sitemapLastmod.ts`). The
   committed `functions/sitemap/bundled-catalog.generated.json` is never trusted
   for those dates, so a copy generated before an edit was committed cannot keep an
   old date. Content that is not committed yet gets the local build time.
4. runs `wrangler pages deploy ./dist --branch <branch>`
5. probes the new deployment's `/api/health` (the Worker boots) and
   `/api/templates` (D1 is bound) with `scripts/verify-deployment.mjs`, up to six
   tries 10 seconds apart. A 5xx or no response (DNS, connect, TLS, or a 30-second
   timeout) fails the run; other statuses, such as an access policy, only warn

Cloudflare Pages settings:

- Project name `serplists-com`, set directly in the workflow. Do not use the
  `serp-checklists.pages.dev` domain or the `wrangler.toml` `name` as the project name.
- Domains: `serp-checklists.pages.dev`, `serplists.com`, `staging.serplists.com`.
- Only `serplists.com` may be indexed. `public/_headers` sends
  `X-Robots-Tag: noindex, nofollow` on `staging.serplists.com` and every `*.pages.dev`
  host, and `SEOHead` points canonical links at `https://serplists.com` and defaults
  robots to noindex on any other host (`src/lib/seo/siteOrigin.ts`). Leave robots.txt
  crawlable on those hosts: a `Disallow` would hide the noindex from crawlers.
- GitHub secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`.
  The workflow uses email plus global key because the repo's legacy
  `CLOUDFLARE_API_TOKEN` could not read the Pages project.
- `main` deploys use production D1 (`serp-checklists-db`); `staging` and preview
  deploys use `serp-checklists-staging-db` through the preview binding.
- Keep `actions/checkout` and `actions/setup-node` on v5 or newer. Node is pinned
  to 22 in both workflows.

To deploy by hand (rarely needed): `pnpm run build`, then
`npx wrangler pages deploy ./dist --project-name serplists-com`. Never deploy a
`build:dev` bundle. `build` ignores `.dev.vars` and refuses a localhost
`VITE_API_URL`, so a local API URL cannot ship.

## Observability

- API logs are JSON lines from `log()` in `functions/api/utils/logger.ts`. Every
  request gets a `requestId`, returned as the `X-Request-Id` header. ESLint rejects
  direct `console.*` in `functions/`. Log ids, never emails, tokens, or client IP
  addresses (the router keeps the IP in memory for rate limits only). As a backstop,
  `log()` writes any field named `ip`, `email`, `password`, `token`,
  `authorization`, or `cookie` as `"[redacted]"`, and a field cannot replace the
  `level` or `message` (event name) of the line. It also writes an `Error`-valued
  field as `describeErrorForLog()` output and cuts any string field before
  Drizzle's `\nparams:` section.
- Better Auth's own logs go through `log()` as `better_auth` lines
  (`functions/api/utils/better-auth-logger.ts`), because its default logger prints
  raw emails (`User not found { email }` on every unknown sign-in or reset). The
  text is kept in `detail` with email addresses replaced by `[email]`, objects it
  passes are dropped, and an error keeps only its name and message, cut before
  Drizzle's bound `params:`. Routine user mistakes (unknown email, wrong password,
  repeat sign-up) are logged as `info`, not `error`.
- The router logs each request's path through `sanitizeLogPath()`
  (`functions/api/utils/log-path.ts`), which replaces the secrets some routes carry
  in the URL with `:token`: `auth/reset-password/<token>`,
  `checklists/shared/<shareToken>` and `teams/invites/<token>/accept`. Add any new
  route with a secret in its path there. Cloudflare's own request metadata still
  records the full URL, so limit who can read the runtime logs.
- Handlers that catch their own errors must log them: the router's `api_error`
  line only sees errors that reach it. Log errors with `...describeErrorForLog(error)`
  (fields `errorName` and `errorMessage`), which drops the bound parameters (user
  content, emails, share and reset tokens) that Drizzle puts in a failed query's
  message and logs the D1 error it wraps instead. The router's `api_error` and
  `env_validation_error` lines, the auth email throttle, and the Stripe webhook
  (which also stores that message in `stripe_webhook_events.error`) do this. The
  MCP endpoint (`/api/mcp`) answers tool failures with an HTTP 200 JSON-RPC error,
  so look for its `mcp_tool_error`, `mcp_tool_invariant`, and `mcp_auth_error`
  lines rather than a 5xx status.
- Production: Cloudflare runtime logs for the Pages project. There is no external
  log sink, metrics, traces, or alerting yet.
- Local: `pnpm run dev:all` mirrors output to `tmp/logs/dev-all.log`; search for
  `"level":"error"` or a request id.
- Frontend: `ErrorBoundary` (the page-level `RouteErrorBoundary` and the last-resort
  one in `App.tsx`, see [FRONTEND.md](FRONTEND.md#structure)) and analytics
  (`src/lib/analytics.ts`, in-memory) write to the browser console only.
- Weekly maintenance (`.github/workflows/maintenance.yml`): a Claude doc-gardening
  agent opens a PR fixing docs that drifted from the code, and a report of recorded
  debt is posted as an issue (`pnpm run maintenance:report`).

## Incident response

Fast triage (5 minutes):

1. Decide whether the problem is frontend-only or API-only; `GET /api/health`
   confirms the Functions respond.
2. Check the Cloudflare runtime logs and collect `X-Request-Id` values from
   failing responses.
3. If the incident started right after a deploy, roll back to the previous Pages
   deployment first.

Common failures:

- **Login loops or 401s:** confirm requests send cookies (`credentials: "include"`)
  and CORS allows credentials for the right origin (`FRONTEND_URL`,
  `CORS_ALLOWED_ORIGINS`). Rotating `BETTER_AUTH_SECRET` invalidates all sessions.
- **All `/api/*` return Cloudflare 1101:** the auth secret is missing or under 32
  characters, or a URL setting is malformed. Validate with `pnpm run typecheck:env`.
- **500s on templates or runs:** check recent migrations and deploys. For recovery,
  prefer D1 Time Travel (see [database operations](design-docs/database-operations.md)).
- **Uploads failing or 404:** confirm the `R2_UPLOADS` binding and bucket name, that
  the requested key exists, and that no lifecycle rule is expiring objects.

## Testing conventions

- Run the smallest relevant test while developing; run `pnpm run verify` before a PR.
- Smoke and e2e suites run against local workers or dedicated staging, never
  production. They use an isolated stack: frontend `localhost:4173`, API
  `localhost:8788`, and D1 state in `.wrangler/smoke-state`. Keep both on the
  `localhost` host name; mixing `127.0.0.1` drops `SameSite=Lax` cookies.
  `tests/e2e/run-smoke.mjs` seeds the same directory the API server runs on
  (`PLAYWRIGHT_WRANGLER_PERSIST_TO`) whatever ports or URLs you preset, and a
  preset `PLAYWRIGHT_WRANGLER_PERSIST_TO` must be a folder inside `.wrangler/`
  other than `.wrangler/state`. It stops if a local `VITE_API_URL` or
  `PLAYWRIGHT_API_URL` uses another port than `PLAYWRIGHT_API_PORT`, and seeds
  nothing for a remote API or with `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`.
- The local stack is a non-production host, so `SEOHead` noindexes every page there.
  A spec that checks a page's own robots rule loads the page as
  `https://serplists.com` with `serveLocalAppAsProduction` in
  `tests/e2e/route-structure.spec.ts`: Playwright answers that origin from the local
  wrangler Pages server (built app, page functions and API) and aborts every other
  request, so nothing reaches production or analytics.
- e2e specs share one database, so `test:e2e:full` runs with one worker (TD-11).
- That database holds only what `seed-test` creates (`db/seeds/local.ts`), plus the
  Templates bundled in `src/data`. A spec that opens `/profile/<user>/<slug>` uses one
  of those or creates its own Template; `tests/unit/e2e/seeded-template-paths.test.ts`
  fails on any other literal path unless an `e2e-unseeded-template:` comment says it
  is missing on purpose.
- The local API runs on workerd (wrangler's dev server), which closes a keep-alive
  connection that has been idle for 5 seconds; a request sent on it at that moment is
  lost. Playwright's request client (`page.request`, the `request` fixture,
  `route.fetch`) keeps idle connections with no limit of its own, so its request
  failed with `socket hang up`. `playwright.config.ts` calls `disableRequestKeepAlive()`
  from `tests/e2e/support/request-connections.ts`, which gives each of its requests a
  new connection; `tests/unit/e2e/request-connections.test.ts` fails if a Playwright
  upgrade undoes that.
- Wrangler 4.54's dev proxy keeps its own connections to the worker the same way and
  has no setting for it (TD-24 in the tech debt tracker): a non-GET it could not
  forward gets `503 Your worker restarted mid-request` although the worker never
  restarted, without CORS headers (the browser reports `Failed to fetch`), and a GET
  is held until another request reaches the proxy. Specs set up and read their data
  with `apiRequest()` or `apiJson()` from `tests/e2e/support/api-requests.ts`: they
  call the API through Playwright's request client with the page's cookies, and send
  a request again only when the proxy dropped it. A fetch inside `page.evaluate()`
  stays only where the page's own request is what the test checks, marked with an
  `e2e-in-page-fetch:` comment; `tests/unit/e2e/e2e-setup-requests.test.ts` fails on
  any other. `trackApiRequests()` in the same file waits for the page's own requests,
  such as the several that Account Settings sends when signing in lands there.
- To trace a failed request to the local API, open wrangler's debug log for that run:
  every session writes one, with timestamps and the API's own `api_request` lines, to
  `.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on
  Windows). Compare it with the times in the test's trace. A reload of the worker
  shows there as `Reloading local server`.
- Reuse stable test identities instead of registering a new account on every run.
  Production auth blocks known test-email domains; keep that coverage when auth
  routes change.
- Handler tests assert the public contract, not incidental query order. Request
  the legacy template backup explicitly with `?format=backup`; the default export
  is portable.
- Pages Function unit tests mock `drizzle-orm/d1` at the adapter boundary with
  `vi.hoisted` chains and keep real schema and query expressions. Call
  `vi.clearAllMocks()` in `beforeEach()` when hoisted chains are reused.

  ```ts
  const dbMocks = vi.hoisted(() => {
    const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
    const insertChain = { values: vi.fn() };
    const db = { select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) };
    return { selectChain, insertChain, db };
  });
  vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));
  ```

- To test SQL guards or races, run the real handler against `SqliteD1` from
  `tests/support/sqlite-d1.ts`: a node:sqlite database with every migration applied that
  implements the D1 calls Drizzle makes. `beforeNextBatch()` commits a competing write
  just before the handler's next `db.batch()`, and `queryPlan()` returns
  `EXPLAIN QUERY PLAN` for a recorded statement. See
  `tests/unit/functions/api/teams-sqlite.test.ts`.
- Coverage settings live under `test.coverage` in `vitest.config.ts`
  (`pnpm run test:coverage`); `@vitest/coverage-v8` must match the Vitest version.
  If you override `test.exclude`, keep `node_modules`, `dist`,
  `playwright-report`, `test-results`, `tests/e2e/**`, and `tmp/**` excluded.
- If production test accounts must be removed, inspect dependent rows first and
  clean auth, templates, runs, likes, analytics, entitlement, and Stripe records
  as one deliberate maintenance operation.
