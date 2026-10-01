---
name: debug-api
description: Find out what the SERP Lists API did for a request on the local stack. Queries the logs of pnpm run dev:all and the browser tests with pnpm run logs:query (errors grouped, one request's timeline, latency and error counts per route, the slowest requests), traces a browser or test request to its lines through the X-Request-Id header, checks local D1 data, and measures D1 rows read per statement or endpoint. Use when an API call fails or returns the wrong data, a page shows an error, or a change touches queries or logging.
---

# Debug an API request locally

The API logs JSON lines through `log()` in `functions/api/utils/logger.ts`: `level`, `message`
(the event name), `requestId`, and ids, never personal data. Every response carries its request's
id in the `X-Request-Id` header, and the router writes one `api_request` line per request with
`method`, `path`, `status`, and `durationMs`. What each event means, and the rules for new log
lines, are in the Observability section of `docs/RELIABILITY.md`.

## 1. Find the request's lines

`pnpm run dev:all` mirrors the server output to `tmp/logs/dev-all.log`, and the browser tests'
server mirrors its output to `tmp/logs/e2e-server.log`. `pnpm run logs:query` reads either one
(add `--file tmp/logs/e2e-server.log` for a browser test run):

```bash
pnpm run logs:query errors               # warnings, errors and 5xx requests, grouped, with request ids
pnpm run logs:query request <id>         # everything one request logged, in order, with offsets
pnpm run logs:query routes --since 15m   # requests, 4xx, 5xx, p50, p95 and max latency per route
pnpm run logs:query slow                 # the slowest requests and their ids
pnpm run logs:query lines --event mcp_tool_error --since 1h
```

Add `--json` to read a result as data; `pnpm run logs:query --help` lists every filter.

Get the id from the response: `get_network_request` in the browser (the `verify-web` skill), the
test's trace, or `curl -si` for a call you make yourself. The MCP endpoint (`/api/mcp`) answers
tool failures with HTTP 200 JSON-RPC errors, so look for its `mcp_tool_error`,
`mcp_tool_invariant`, and `mcp_auth_error` lines instead of a 5xx status.

`pnpm run preview` runs in workerd and writes no log file: its output goes to the terminal that
started it, and wrangler writes a debug log for each session, with the `api_request` lines, to
`.wrangler/logs` in your home folder (`%APPDATA%\xdg.config\.wrangler\logs` on Windows).
`pnpm run logs:query errors --file <that folder>` reads the folder's newest log.

## 2. Read what it means

- Only an `api_request` line with a 5xx status: a handler caught the error without logging it.
  Add a `log('error', ...)` with `...describeErrorForLog(error)` there, as the Observability
  section describes.
- `env_validation_error`: `.dev.vars` is missing a variable or has an invalid one;
  `pnpm run typecheck:env` names it. Never print `.dev.vars`: it holds secrets.
- A failed query after pulling new code: local D1 is behind; `pnpm run setup` applies pending
  migrations.
- Sign-in answers `429`: the local sign-in rate limit (300 per hour), not bad credentials.

## 3. Check the data

`pnpm run db:query "SELECT * FROM templates LIMIT 5"` runs a statement on local D1, never a
remote one (no `--` before the SQL: pnpm would pass it on to wrangler). Table and column names
are in `docs/generated/db-schema.md`.

## 4. Measure D1 cost

D1 bills rows scanned, not rows returned (`docs/design-docs/d1-cost.md`):

- **Per statement:** add `D1_PROFILE=true` to `.dev.vars` (without printing the file) and
  restart `pnpm run dev:all`. Each statement then logs a `d1_query` line with `rowsRead`,
  `rowsWritten`, `rowsReturned`, and `durationMs`; `pnpm run logs:query d1` adds them up per
  statement, most rows read first. Every line carries its request's id, so
  `pnpm run logs:query request <id>` ends with that request's D1 totals, and `routes` adds the
  rows each request read (p95 and max) per route. Remove the line when done.
- **Per endpoint, at scale:** `pnpm run d1:profile` builds the app, seeds about 150k rows into an
  isolated D1, replays requests, and writes `tmp/d1-profile/report.md`. It is a full build and
  stack of its own: run it alone, and add `-- --reuse` to skip the rebuild next time.
