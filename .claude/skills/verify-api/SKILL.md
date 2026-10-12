---
name: verify-api
description: Check a SERP Lists API change by calling the running API the way the app and agents do. Runs this checkout's dev:all (starting it when none runs), signs in a seeded user, makes a Run Key for the run, calls the JSON routes under /api and the MCP endpoint /api/mcp (tools/list and each tool the change touches) from a plan file, and keeps every request and answer, a doctor of which server and commit answered, and the server's log lines under tmp/agent/verify/, then revokes the key and stops only what it started. Use after changing an API handler, an error answer, Run Keys, an MCP tool or anything an MCP client sees, and to reproduce an API bug before fixing it.
---

# Check an API change by calling it

The API's unit tests call handlers in the test process, and the browser tests drive the Run Key MCP
through the production build. This is the look at the running thing: the API as `pnpm run dev:all`
serves it, called over HTTP as a signed-in user and as an MCP client, with the answers kept. What
should keep working stays a test.

## 1. Find what the change touches

The feature map is the route list and the product docs:

- **JSON routes:** `docs/agents/system-overview.md`, API Routes; their errors in
  `docs/product/api-errors.md`.
- **Run Keys and MCP tools:** `docs/product/run-keys.md` (what an agent can do), the permission
  each tool needs in `docs/agents/agent-access.md`, Run Keys, and the release notes in
  `docs/product/mcp.md`.

## 2. Write the plan

A plan is a JSON file, best kept in the run's folder. Steps run in order:

```json
{
  "user": "admin@test.com",
  "permissions": ["templates:read", "runs:read"],
  "steps": [
    { "api": "GET /api/templates" },
    { "mcp": "tools/list" },
    { "tool": "list_templates" },
    { "tool": "get_template", "arguments": { "templateId": "{$3.templates.0.id}" } },
    { "tool": "get_template", "arguments": { "templateId": "missing" }, "expect": "template_not_found" },
    { "tool": "start_run", "arguments": { "templateId": "{$3.templates.0.id}" }, "expect": "permission_denied" }
  ]
}
```

- `user` is a seeded user (`docs/agents/development-environment.md`, Sign in), `admin@test.com`
  when left out. `permissions` are the Run Key's, its defaults when left out.
- An `api` step is `<METHOD> /api/<path>` with an optional JSON `body`, sent with the user's
  session. It expects a 2xx answer, or the status in `expect`.
- A `tool` step calls one MCP tool with its `arguments`; an `mcp` step sends any JSON-RPC method
  with `params`. Both send the Run Key and expect `ok`, or in `expect` the tool's error (such as
  `permission_denied`), or `rpc -32602` for a JSON-RPC error.
- `{$<step>.<path>}` is a value from an earlier step's answer: an API step's JSON body, or a
  tool's `structuredContent`. A value that is a reference and nothing else keeps its type.

## 3. Run it

From the repository root:

```sh
node --import tsx .claude/skills/verify-api/run.ts <name> <plan.json>
```

The script does each part of a run, and prints a line per step:

- **Run state:** `tmp/agent/verify/<date>-<name>/` (git ignores it and housekeeping keeps it),
  with `run.json` naming the server, and `plan.json`.
- **Launch:** it uses this checkout's `dev:all` when `tmp/dev-session.json` names a running
  launcher that answers `/api/health`, and otherwise starts one and waits for that answer.
  `--base http://localhost:<port>` uses another server on this machine instead, such as
  `pnpm run preview`; it refuses any other host, so it never makes a Run Key on Staging or
  Production.
- **Doctor:** `doctor.txt` names the server and who started it, the commit and how many files
  changed since, what `/api/health` answered, the user and the key's permissions, and the MCP
  server's version from `initialize`. Read it before trusting an answer.
- **Drive:** it signs in, makes a Run Key named `verify-api <name>`, and runs the steps.
- **Proof:** `requests.txt` lists each step's status or outcome against what the plan expected,
  with its request id; `NN.json` holds what was sent and the answer; `server.log` holds the API's
  log lines for those request ids (a `--base` server writes none there). No file holds the key's
  secret or the session cookie.
- **Cleanup:** it revokes the Run Key, signs out, and stops `dev:all` only if it started it.

Its exit status is 1 when the server or sign-in fails or an answer isn't the one expected, and 2
for a plan it can't read.

## 4. Read the answers

An MCP failure keeps HTTP 200: a refusal is a tool result with `isError` and an `error` code, and
invalid arguments are JSON-RPC error `-32602` naming each field (`docs/agents/agent-access.md`,
Transport). To see what the API did for a step, give its request id to the `debug-api` skill
(`pnpm run logs:query request <id>`).

## Report

Say which routes and tools you called, as which user and with which permissions, what each answer
showed for the behavior you changed, and the run's folder. A check that wasn't run is reported as
not run, not as passed.
