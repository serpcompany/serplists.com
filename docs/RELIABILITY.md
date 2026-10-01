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
| CI Quality Gate | `verify` steps plus local D1 fixture tests, the OpenNext build (`build:worker`), and browser tests against it: smoke on every PR, the full suite on PRs into `main` |
| CI schema parity | Replays every migration and compares it with the Drizzle schema |
| Claude code review | Advisory inline review comments on every non-draft PR; never blocks merging ([agent workflow](design-docs/agent-workflow.md#claude-code-review)) |
| Before a release | `pnpm run verify:release` locally; `pnpm run verify:staging` or `pnpm run verify:prod:d1` for remote D1 readiness (needs Cloudflare credentials) |

Lefthook hooks install with `pnpm install` (the `prepare` script); run
`pnpm exec lefthook install` if they are missing. When a CI failure looks flaky,
re-run once. If it fails again, treat it as real, and record genuinely flaky tests
in the [tech debt tracker](exec-plans/tech-debt-tracker.md).

## Deploy pipeline

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and
`staging`, and deploys nothing while the app moves to Next.js on Workers: the app now
builds for Workers through OpenNext, so `pnpm run build` no longer makes the `./dist`
that Pages deployed. `.github/workflows/cloudflare-pages-deploy.yml` has no caller, and
its first step fails, so it cannot publish a broken Pages deployment
(`tests/unit/workflows/cloudflare-pages-deploy.test.ts`). The Workers deploy replaces it
at launch ([Next.js migration](exec-plans/active/nextjs-migration.md), phase 4) and keeps
its release checks. Until then, the Pages deploy workflow did this:

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
- Which environment may be indexed, and which host each one answers on, is set by
  `SITE_ENV` and `next.config.ts` now, not by the host a request names (see
  [environments and hosts](#environments-and-hosts)).
- GitHub secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_KEY`.
  The workflow uses email plus global key because the repo's legacy
  `CLOUDFLARE_API_TOKEN` could not read the Pages project.
- `main` deploys use production D1 (`serp-checklists-db`); `staging` and preview
  deploys use `serp-checklists-staging-db` through the preview binding.
- Keep `actions/checkout` and `actions/setup-node` on v5 or newer. Node is pinned
  to 22 in both workflows.

There is no deploy by hand until the Workers deploy exists. `pnpm run build` refuses a
localhost `NEXT_PUBLIC_API_URL` (unless `ALLOW_LOCAL_API_URL=1`), so a local API URL
cannot ship.

## Environments and hosts

The app follows the SERP environment configuration standard: configuration is set
explicitly per environment, never inferred from the host.

| Environment | `wrangler.toml` env | `SITE_ENV` | Canonical host |
| --- | --- | --- | --- |
| Production | `production` | `production` | `serplists.com` |
| Staging | `preview` | `staging` | `staging.serplists.com` |
| Local (`next dev`, `pnpm preview`) | top level | unset | none |

- **Indexing and analytics.** Only a site marked `SITE_ENV=production` may be indexed or
  load analytics ([FRONTEND.md](FRONTEND.md#production-and-other-environments)). Any other
  value, or none, sends `X-Robots-Tag: noindex, nofollow` with every page, API response
  and static file, answers `/robots.txt` with `Disallow: /`, and loads no Tag Manager.
  Canonical URLs name `https://serplists.com` on every environment.
- **Set it in both places.** `SITE_ENV` shapes the build (static pages, the `next.config.ts`
  headers and redirects, `public/_headers`) and what renders on request (the Worker's
  `vars`). Each environment's vars in `wrangler.toml` set it, and each environment's build
  command must set the same value (`SITE_ENV=production pnpm run build:worker`). A build
  without it is non-production, which is the safe default; `scripts/check-env.mjs` rejects a
  value other than `production` or `staging`.
- **One host per environment.** `next.config.ts` sends every other host that reaches the
  Worker to the environment's host with a 308, in one hop and in the canonical URL form:
  `www.serplists.com` to `serplists.com`, and the Worker's `*.workers.dev` URL (and its
  version preview URLs) to `serplists.com` or `staging.serplists.com`. API paths keep their
  exact path. A request with the `x-serplists-smoke-test` header skips the workers.dev
  redirect, so CI can test a deployment on its workers.dev URL; the header is not a secret.
  When adding a host (another custom domain), add its redirect in `next.config.ts` and a
  case in `tests/unit/config/urlStandard.test.ts`.
- **Checking a running site.** `node scripts/check-site-standards.mjs <base-url>
  <staging|production>` checks the URL standard (canonical URLs answer 200, the other form
  308 in one hop, the API is never redirected, the sitemaps list only canonical URLs), the
  environment's robots.txt, `X-Robots-Tag` and Tag Manager, and the host redirects. Against
  a deployed workers.dev URL it sends the smoke-test header, and checks that a request
  without it is redirected. Locally, build with the environment's `SITE_ENV`, serve it with
  `opennextjs-cloudflare preview --env <production|preview> --persist-to <dir>` (after
  `wrangler d1 migrations apply DB --local --env <env> --persist-to <dir>`: an env's local D1
  is a separate database), and pass `--local`, which sends the other hosts as a `Host` header.
  Do not test host rules with an env that has custom-domain `routes`: Wrangler then rewrites
  the `Host` header.

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
  repeat sign-up) are logged as `info`, not `error`. Its config leaves Better Auth's
  logger `level` unset: in 1.3.4 an explicit `error`, `warn` or `debug` also prints
  every API error through the default console logger, and the default already
  publishes `info`, `warn` and `error`.
- The router logs each request's path through `sanitizeLogPath()`
  (`functions/api/utils/log-path.ts`), which replaces the secrets some routes carry
  in the URL with `:token`: `auth/reset-password/<token>`,
  `checklists/shared/<shareToken>` and `teams/invites/<token>/accept`. Add any new
  route with a secret in its path there. It splits the path as the handlers do,
  dropping empty segments, and compares them in any letter case, so extra slashes or
  odd casing cannot move a token past it; `teams/invites/pending/...` carries invite
  ids, not secrets, and is logged as it is. Cloudflare's own request metadata still
  records the full URL, so limit who can read the runtime logs.
- Handlers that catch their own errors must log them: the router's `api_error`
  line only sees errors that reach it. Log errors with `...describeErrorForLog(error)`
  (fields `errorName` and `errorMessage`), which drops the bound parameters (user
  content, emails, share and reset tokens) that Drizzle puts in a failed query's
  message and logs the D1 error it wraps instead. The router's `api_error` and
  `env_validation_error` lines, the auth email throttle, and the Stripe webhook
  (which also stores that message in `stripe_webhook_events.error`) do this. The
  MCP endpoint (`/api/mcp`) answers tool failures with an HTTP 200 JSON-RPC error,
  so look for its `mcp_tool_error`, `mcp_tool_invariant`, `mcp_auth_error` and
  `mcp_template_reload_error` lines rather than a 5xx status. Every authenticated
  MCP request also logs `mcp_request` with its key id, a tool call `mcp_tool_call`
  with the tool's name, and a key over its limit `mcp_rate_limited`.
- Production: Cloudflare runtime logs for the Pages project. There is no external
  log sink, metrics, traces, or alerting yet.
- Local: `pnpm run dev:all` mirrors its output to `tmp/logs/dev-all.log`, and the browser
  tests' server mirrors its output to `tmp/logs/e2e-server.log`. `pnpm run logs:query`
  answers questions about either log:
  - errors grouped by event and error;
  - requests per route, with 4xx and 5xx counts and p50, p95 and max latency;
  - the slowest requests;
  - one request's lines as a timeline;
  - D1 statements by rows read, when `D1_PROFILE=true`.

  Details and examples are in the
  [development environment](design-docs/development-environment.md#run).
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
- Every test runs. ESLint refuses `.skip`, `.todo`, `skipIf`, `runIf`, `fixme`, `xit` and a
  `.only` call in Vitest and Playwright files, and a test file excluded from `test:run` must
  be in `test:local-d1` (`tests/unit/config/no-exceptions.test.ts`). A test that cannot pass
  yet is fixed or deleted, never skipped.
- Smoke and e2e suites run against the production build on a local worker, or dedicated
  staging, never production. `tests/e2e/run-smoke.mjs` builds the app with OpenNext
  (skip with `-- --skip-build`), and Playwright's web server
  (`tests/e2e/preview-server.mjs`) serves it with `opennextjs-cloudflare preview`
  (workerd) on one origin for the pages and the API: `localhost:4173`, or the next free
  port, with D1 state in `.wrangler/smoke-state`. Keep the `localhost` host name;
  mixing `127.0.0.1` drops `SameSite=Lax` cookies. The runner seeds the same directory
  the preview runs on (`PLAYWRIGHT_WRANGLER_PERSIST_TO`) whatever port or URL you preset,
  and a preset `PLAYWRIGHT_WRANGLER_PERSIST_TO` must be a folder inside `.wrangler/`
  other than `.wrangler/state`. It stops if `PLAYWRIGHT_API_URL` is not on the app's
  origin, and seeds nothing for a remote app or with `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`.
- The production build has no dev helpers: specs sign in with `fillSignInForm()` from
  `tests/e2e/support/sign-in.ts` (the login page's Fill buttons exist only in
  `next dev`), and move inside the app without a reload with `navigateInApp()` from
  `tests/e2e/support/navigation.ts` (Next.js's router; a synthetic `pushState` only
  changes the URL).
- The browser tests run the production configuration (`E2E_SITE_ENV` in
  `tests/e2e/run-smoke-lib.mjs`): the runner builds with `SITE_ENV=production`, the preview
  gets the same var, and CI's Build step sets it too. Pages are then indexable and load Tag
  Manager, as on `serplists.com`. The runner refuses a build it reuses (`--skip-build`) that
  was made for another environment, since the preview's var alone cannot change what the
  build baked in. Staging's noindex is covered by the unit tests and
  `scripts/check-site-standards.mjs`. `tests/e2e/site-standards.spec.ts` checks the URL
  standard, the production rules and the host redirects (Playwright sends the other hosts
  as a `Host` header).
- A spec that checks a page's own robots rule loads the page as `https://serplists.com`
  with `serveLocalAppAsProduction` in `tests/e2e/route-structure.spec.ts`: Playwright
  answers that origin from the local preview (the built app, its pages and API) and aborts
  every other request, so nothing reaches production or analytics. A page can carry two
  robots tags, its server metadata's and the one it adds in the browser (`NoIndexMeta`), so
  `expectRobots` there checks every one.
- Specs open pages at their canonical URLs (`/dashboard/templates/`, `/login/`); a URL
  without its slash only tests a redirect.
- Browser tests run on one Playwright worker (`playwright.config.ts`): e2e specs share
  one database (TD-11), and one workerd process renders every page and every link
  prefetch, so parallel browsers only queue up behind each other there.
- That database holds only what `seed-test` creates (`db/seeds/local.ts`), plus the
  Templates bundled in `src/data`. A spec that opens `/profile/<user>/<slug>` uses one
  of those or creates its own Template; `tests/unit/e2e/seeded-template-paths.test.ts`
  fails on any other literal path unless an `e2e-unseeded-template:` comment says it
  is missing on purpose.
- The local app runs on workerd (wrangler's dev server, under the preview), which closes a keep-alive
  connection that has been idle for 5 seconds; a request sent on it at that moment is
  lost. Playwright's request client (`page.request`, the `request` fixture,
  `route.fetch`) keeps idle connections with no limit of its own, so its request
  failed with `socket hang up`. `playwright.config.ts` calls `disableRequestKeepAlive()`
  from `tests/e2e/support/request-connections.ts`, which gives each of its requests a
  new connection; `tests/unit/e2e/request-connections.test.ts` fails if a Playwright
  upgrade undoes that.
- Wrangler's dev proxy (its ProxyWorker) keeps its connections to the worker open the same
  way, and there the risk is not one moment: while the worker is busy (a page render, the API
  calls a page sends at once), its workerd reads no new request and runs no timer, so a
  request that reaches an idle connection in that time can lose to the connection's 5-second
  timer once the worker catches up, even one that arrived a second before it was due. The
  proxy then answers `500` and logs `Network connection lost`; it resends a GET or HEAD itself,
  not a POST, PUT or DELETE (cloudflare/workers-sdk#14641). The invite created right after an
  Organization in `team-invite-flow.spec.ts` was lost this way whenever the machine was busy.
  `patches/wrangler@4.143.0.patch`, which pnpm applies on install (`pnpm.patchedDependencies`
  in `package.json`), puts a relay between the proxy and the worker, in wrangler's own process
  (`wrangler-dist/serplists-user-worker-relay.js`): it sends every request to the worker over a
  new connection, which that timer never applies to, and never closes an idle connection from
  the proxy itself, so nothing is lost and nothing is sent twice.
  `tests/unit/e2e/wrangler-proxy-patch.test.ts` fails if a wrangler upgrade leaves the patch
  behind: check whether upstream fixed #14641, and if not, re-create the patch for the new
  version with `pnpm patch wrangler@<version>`.
- Specs set up and read their data with `apiRequest()` or `apiJson()` from
  `tests/e2e/support/api-requests.ts`: they call the API through Playwright's request
  client with the page's cookies. A fetch inside `page.evaluate()`
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
- API handler unit tests mock `drizzle-orm/d1` at the adapter boundary with
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
- Unit tests run in Vitest's node environment, with no DOM, jsdom or testing-library, so a
  component test takes one of three routes:
  - Render the component to HTML with `renderToStaticMarkup` and read the markup.
    `tests/unit/components/accessibleMarkup.ts` finds its controls (fields, buttons and any
    element with a widget role) and names them as a screen reader does: `aria-labelledby`,
    `aria-label`, a `<label for>`, or a button's text, never a placeholder.
    `tests/unit/components/focusVisibility.ts` finds a focusable element that is invisible,
    or hidden from assistive tech, while it has focus.
  - Call the component as a function, with React's hooks replaced in `vi.mock('react')`, and
    search the element tree it returns (`tests/support/elementTree.ts`) for handlers and the
    next component's props. `useStateKeptBetweenRenders` (`tests/support/hookStateSlots.ts`)
    keeps state between calls as React keeps it between renders, and
    `createFormControlMountedLikeUseForm` (`tests/support/editorFormControl.ts`) gives the
    template editor a real react-hook-form control.
  - Mount it with React DOM into the fake DOM of `tests/fixtures/fakeDom.ts`
    (`installFakeDomGlobals`, `createFakeContainer`) and drive it with `act()`, `click()` and
    `dispatch()`, when the test needs effects, focus or clicks. A hook that needs React's own
    effects or TanStack Query runs the same way, in a probe component that renders nothing.
    React DOM loaded without a DOM listens for the old IE input events, so a test types into a
    field by calling the `onChange` in the props React keeps on the node (`__reactProps$...`).
    React DOM sets an input's `type` and `value` as properties, so read them from the node,
    not its attributes. After unmounting a tree that used TanStack Query, wait one timer tick
    before `afterAll` restores the globals: Query hands React its batched notifications on a
    timer, and React fails on one that runs after the fake window is gone.

  Base UI's overlays render nothing until they open, and their portals render nothing without
  a DOM, so component tests replace dialogs, alert dialogs, menus and select popups with the
  in-place versions in `tests/support/overlaysInPlace.tsx`.
- Coverage settings live under `test.coverage` in `vitest.config.ts`
  (`pnpm run test:coverage`); `@vitest/coverage-v8` must match the Vitest version.
  If you override `test.exclude`, keep `node_modules`, `dist`,
  `playwright-report`, `test-results`, `tests/e2e/**`, and `tmp/**` excluded.
- If production test accounts must be removed, inspect dependent rows first and
  clean auth, templates, runs, likes, analytics, entitlement, and Stripe records
  as one deliberate maintenance operation.
