# Development Environment

Every clone or git worktree runs its own isolated stack: local D1 state lives in
that checkout's `.wrangler/`, and the launcher picks a free port pair. Requirements:
Node.js 22 and pnpm 9 (Wrangler is a dev dependency).

## Set up

```bash
pnpm install        # also installs git hooks
pnpm run setup      # safe to re-run
```

`setup` creates `.dev.vars` from `.dev.vars.example` with a generated
`BETTER_AUTH_SECRET` and optional integrations commented out (never overwriting an
existing file), creates and seeds local D1 if the checkout has none (otherwise
applies pending migrations), installs the Playwright browser, and builds `dist/`
if it is missing. `.dev.vars` is the only local env file; variables are listed in
[SECURITY.md](../SECURITY.md#secrets-and-environment). The client reads `VITE_*`
variables through `src/env.ts`; `VITE_API_URL` overrides the dev API base
(`http://localhost:8788/api`; `/api` when deployed).

## Run

```bash
pnpm run dev:all    # frontend + API (dev:auto is an alias)
pnpm run dev        # frontend only (Vite)
pnpm run dev:api    # API only (Pages Functions, serves dist/)
pnpm run dev:stop   # stop them, including child processes
```

The frontend and API move together as a port pair, preferring `8080` and `8788`.
The chosen URLs are printed and saved in `tmp/dev-session.json`, and the launcher
updates `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `PORT`, and `VITE_API_URL` together
(do not hand-edit one side; auth origins and CORS must match). Use
`pnpm run dev:stop` to stop: killing only the parent process leaves Vite and
Wrangler running on Windows and holding the ports.

Output is mirrored to `tmp/logs/dev-<mode>.log`. API logs are JSON lines with a
`requestId` (also the `X-Request-Id` response header):

```bash
grep '"level":"error"' tmp/logs/dev-all.log
```

A failed query after pulling new code usually means local D1 is behind;
`pnpm run setup` applies pending migrations.

## Sign in

Seeded users share the password `password123`:

| User | Plan | Notes |
| --- | --- | --- |
| `admin@test.com` | Pro | Pro from a seeded `entitlement_overrides` row |
| `jane@test.com` | Pro | Pro from a seeded `entitlement_overrides` row |
| `john@test.com` | Free | Member of seeded Organizations |
| `bob@test.com` | Free | |
| `checklists@serp.co` | Pro | Official `serp` publisher that owns the official Templates |

In development, `/login` has quick-fill buttons and `DevLoginBar` sits at the
bottom of the app. `pnpm run db:reset:test-user-passwords` restores changed
passwords. Admin and Jane are Pro only through their seeded overrides, never by
email address, so a local D1 seeded before those rows existed shows them as Free
until `pnpm run db:seed`. If sign-in fails, check the API is running, local D1 is seeded, and the
browser calls the intended API URL. A `429` means the local auth rate limit (300
per hour), not bad credentials.

## See the UI

```bash
pnpm run ui:snap -- dashboard/templates --login admin@test.com
pnpm run ui:snap -- templates --mobile
```

Saves a full-page screenshot in `tmp/snapshots/` and prints the accessibility tree
(a readable text outline of the page), console errors, and failed requests. Write
routes without the leading slash; Git Bash rewrites `/path` arguments into file
paths. Use it to reproduce a bug before fixing it and to show the fix afterwards.

## Local database

```bash
pnpm run db:reset                  # clear local D1, migrate, and seed
pnpm run db:seed                   # seed only
pnpm run db:migrate:d1:local
pnpm run db:migrations:list:local
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

The seed creates test Users, sample Personal and Organization data, memberships,
pending invites, Organization entitlement overrides, audit rows, and the official
`serp` publisher and Templates. Fixture ids keep legacy `team` names. Remote
commands and the staging/production model are in
[database operations](database-operations.md).

## Tests

```bash
pnpm run verify           # pre-PR gate
pnpm run test:run         # unit tests (pnpm run test for watch mode)
pnpm run test:local-d1    # local D1 fixture integration
pnpm run test:smoke       # @smoke browser specs on an isolated stack
pnpm run test:e2e:full    # every browser spec on the same stack, one worker
pnpm run test:coverage
```

Browser failures keep a trace, video, and screenshot under `tests/test-results/`;
open a trace with `pnpm exec playwright show-trace <path>/trace.zip`. Each failure
also has an `error-context.md` with the page snapshot at the moment it failed.
Testing conventions are in [RELIABILITY.md](../RELIABILITY.md#testing-conventions).

## Verify an Organization flow by hand

1. Sign in as `admin@test.com` and create an Organization at `/dashboard/settings`.
2. Create a link invite for another seeded or newly registered email.
3. In a separate browser context, sign in as the invitee.
4. Open `/team-invites/:token` (legacy route) and click **Accept invite**, or accept from
   the incoming invites on `/dashboard/settings`.
5. Switch to the Organization and confirm Personal data stays separate.

## All scripts

| Area | Scripts |
| --- | --- |
| Run | `setup`, `dev`, `dev:api`, `dev:all`, `dev:stop`, `build`, `build:dev`, `preview`, `ui:snap` |
| Checks | `verify`, `verify:release`, `lint`, `typecheck`, `typecheck:env`, `check:repo`, `docs:check`, `deps:check`, `deps:baseline`, `secret:scan`, `schema:portable:check`, `templates:check`, `db:schema:check`, `sitemap:check`, `maintenance:report`, `sre:dup` |
| Tests | `test`, `test:run`, `test:unit`, `test:local-d1`, `test:coverage`, `test:smoke`, `test:e2e`, `test:e2e:full`, `test:e2e:ui` |
| Generators | `schema:portable:generate`, `db:schema:generate`, `sitemap:generate`, `templates:generate`, `templates:render-markdown`, `docs:references` |
| Local D1 | `d1:profile`, `db:reset`, `db:seed`, `db:seed:official:local`, `db:migrate:d1:local`, `db:migrations:list:local`, `db:query`, `db:cleanup:local`, `db:reset:test-user-passwords`, `db:generate`, `check:db:drizzle-parity` |
| Remote D1 | `verify:staging`, `verify:prod:d1`, `db:migrate:d1:staging`, `db:migrate:d1:prod`, `db:migrations:*`, `check:*:d1-schema`, `check:preview:d1-binding`, `db:seed:official:staging`, `db:seed:official:remote`, `db:cleanup:remote` |
| Stripe (test mode) | `stripe:local:setup`, `stripe:local:listen`, `stripe:local:scrub-live`, `stripe:portal:configure` |
