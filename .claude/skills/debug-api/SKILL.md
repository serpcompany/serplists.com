---
name: debug-api
description: Find out what the SERP Lists API did for a request on the local stack. Reads the JSON log lines that pnpm run dev:all mirrors to tmp/logs/dev-all.log by request id, level, or event, traces a browser or test request to its lines through the X-Request-Id header, checks local D1 data, and measures D1 rows read per statement or endpoint. Use when an API call fails or returns the wrong data, a page shows an error, or a change touches queries or logging.
---

# Debug an API request locally

The API logs JSON lines through `log()` in `functions/api/utils/logger.ts`: `level`, `message`
(the event name), `requestId`, and ids, never personal data. Every response carries its request's
id in the `X-Request-Id` header, and the router writes one `api_request` line per request with
`method`, `path`, `status`, and `durationMs`. What each event means, and the rules for new log
lines, are in the Observability section of `docs/RELIABILITY.md`.

## 1. Find the request's lines

`pnpm run dev:all` mirrors the server output to `tmp/logs/dev-all.log`:

```bash
grep '"level":"error"' tmp/logs/dev-all.log | tail -20       # recent errors
grep '"status":5[0-9][0-9]' tmp/logs/dev-all.log | tail -20   # server errors, one line per request
grep '"requestId":"<id>"' tmp/logs/dev-all.log                # everything one request logged
```

Get the id from the response: `get_network_request` in the browser (the `verify-web` skill), the
test's trace, or `curl -si` for a call you make yourself. The MCP endpoint (`/api/mcp`) answers
tool failures with HTTP 200 JSON-RPC errors, so look for its `mcp_tool_error`,
`mcp_tool_invariant`, and `mcp_auth_error` lines instead of a 5xx status.

The preview and the browser tests run in workerd and don't write that file: their output goes to
the terminal that started them, and wrangler writes a debug log for each session, with the
`api_request` lines, to `.wrangler/logs` in your home folder
(`%APPDATA%\xdg.config\.wrangler\logs` on Windows).

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
  `rowsWritten`, `rowsReturned`, and `durationMs`. Remove the line when done.
- **Per endpoint, at scale:** `pnpm run d1:profile` builds the app, seeds about 150k rows into an
  isolated D1, replays requests, and writes `tmp/d1-profile/report.md`. It is a full build and
  stack of its own: run it alone, and add `-- --reuse` to skip the rebuild next time.
