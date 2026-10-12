# Observability

- API logs are JSON lines from `log()` in `functions/api/utils/logger.ts`. Every
  request gets a `requestId`, returned as the `X-Request-Id` header. The router handles
  each request inside a context (`functions/api/utils/request-context.ts`,
  `AsyncLocalStorage` under `nodejs_compat`), and `log()` adds that id to every line
  written while the request is handled, D1 profiling lines included, so
  `pnpm run logs:query request <id>` finds all of them. ESLint rejects
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
  [development environment](development-environment.md#run).
- Frontend: `ErrorBoundary` (the page-level `RouteErrorBoundary` and the last-resort
  one in `App.tsx`, see [FRONTEND.md](frontend.md#structure)) and analytics
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
  prefer D1 Time Travel (see [database operations](database-operations.md)).
- **Uploads failing or 404:** confirm the `R2_UPLOADS` binding and bucket name, that
  the requested key exists, and that no lifecycle rule is expiring objects.
