# Development Environment

Every clone or git worktree runs its own isolated stack: local D1 state lives in
that checkout's `.wrangler/`, and the launcher picks a free port. The app is one Next.js
server: the pages and the API (`src/app/api/[[...route]]/route.ts`) share an origin, and
the Cloudflare bindings (D1, R2, vars) come from `wrangler.toml` and `.dev.vars` through
`getCloudflareContext()`. Requirements: Node.js 22 and pnpm 9 (Wrangler is a dev
dependency).

## Set up

```bash
pnpm install        # also installs git hooks
pnpm run setup      # safe to re-run
```

`setup` creates `.dev.vars` from `.dev.vars.example` with a generated
`BETTER_AUTH_SECRET` and optional integrations commented out (never overwriting an
existing file), creates local D1 if the checkout has none (otherwise applies pending
migrations), seeds whatever seed data is missing, and installs the Playwright browser.
The seed decision comes from the database, not
its directory: `tsx scripts/data/local-d1-data.ts seed-status` reports whether the
test data, the official Templates and the official login are there, and setup runs
only the missing stages, so a seed that failed or was interrupted is finished on the
next run and data you created is never reset. A database seeded before the test
Templates got `sample-` slugs has test Templates holding four official Templates'
slugs, so those official Templates are missing; setup renames the test Templates'
slugs in place first (the `repair-test-slugs` stage) and then seeds them. Setup fails,
without printing the sign-in hint, if a seed stage fails (the error names the stage
and how to recover) or seed data is still missing afterwards.

`.dev.vars` is the only local env file; variables are listed in
[SECURITY.md](../SECURITY.md#secrets-and-environment). The server reads it as Worker
vars: `next dev` through `initOpenNextCloudflareForDev()` in `next.config.ts`, the preview
through `wrangler dev`. The pages read `NEXT_PUBLIC_*` variables through `src/env.ts`,
which Next.js inlines when it builds or serves them: `pnpm run dev:all` hands `.dev.vars`
to `next dev`, and a build takes them from its shell. Pages call the API on their own
origin (`/api`); `NEXT_PUBLIC_API_URL` only points them at another API. A build refuses a
loopback `NEXT_PUBLIC_API_URL` (`scripts/lib/buildEnv.ts`) unless
`ALLOW_LOCAL_API_URL=1`, and at runtime `src/lib/apiBaseUrl.ts` ignores one unless the
page itself is served from a loopback host. After changing `wrangler.toml` or the variable
names in `.dev.vars`, `pnpm run cf-typegen` regenerates `cloudflare-env.d.ts`.

## Run

```bash
pnpm run dev:all    # the app and its API on a free port (dev:api and dev:auto are aliases)
pnpm run dev:stop   # stop it, including child processes
pnpm run dev        # plain `next dev` on port 3000, without the launcher
pnpm run preview    # build with OpenNext and serve the Worker in workerd, as deployed
```

`dev:all` runs `next dev` on port `3000`, or the next free port. A port counts as free
only when nothing accepts a connection on `127.0.0.1` or `::1` and it binds on
`127.0.0.1`, `::1`, `0.0.0.0` and `::` in turn (`isPortAvailable` in
`scripts/dev-auto-lib.mjs`): on Windows a bind to one address succeeds while another
process holds the port on a different one. The smoke runner and the Stripe listener's
predicted target pick ports the same way. The URL is printed and saved in
`tmp/dev-session.json`. The Worker vars that name the server cannot come from
`.dev.vars`, since the port is picked at start: the launcher passes `FRONTEND_URL` (the
server's origin), `CORS_ALLOWED_ORIGINS` (the configured origins plus that one) and the
auth secret to `next dev` in `SERPLISTS_DEV_BINDINGS`, and `next.config.ts` sets them
over the bindings (`scripts/lib/dev-bindings.mjs`), so the API's own links (Stripe
returns, invites) come back to this server. Use `pnpm run dev:stop` to stop: killing only
the launcher leaves Next.js and workerd running on Windows and holding the port.

The session records the launcher's pid with its process start time. A launch or
`dev:stop` trusts a recorded pid only while that pid still runs
`scripts/dev-auto.mjs` and started at the recorded time, because the OS reuses the
pid of a launcher that was killed. So a stale session file never makes `dev:all`
skip starting, and `dev:stop` never kills an unrelated process: it skips (and
reports) such a pid and always clears the file. While the recorded launcher runs,
`dev:all` prints its URL and exits instead of starting a second server.

Local servers (`localhost`, `127.0.0.1`) get the Content-Security-Policy without
`upgrade-insecure-requests` (`next.config.ts`): on plain http the browser would upgrade
the redirects the app's navigations follow to https, which nothing serves.

Output is mirrored to `tmp/logs/dev-all.log`. API logs are JSON lines with a
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

In development (`next dev`), `/login/` has quick-fill buttons and `DevLoginBar` sits at
the bottom of the app; production builds (the preview, the browser tests) have neither.
`pnpm run db:reset:test-user-passwords` restores changed passwords. Admin and Jane are
Pro only through their seeded overrides, never by email address, so a local D1 seeded
before those rows existed shows them as Free until `pnpm run db:seed`. If sign-in fails,
check `tmp/logs/dev-all.log` and that local D1 is seeded. A `429` means the local sign-in
rate limit (300 per hour), not bad credentials.

## See the UI

```bash
pnpm run ui:snap -- dashboard/templates --login admin@test.com
pnpm run ui:snap -- templates --mobile
```

Opens the app `dev:all` runs (its port from `tmp/dev-session.json`, else `3000`; the API
is on the same origin). Saves a full-page screenshot in `tmp/snapshots/` (or at `--out`, which must end in
`.png`, `.jpg` or `.jpeg`) with the accessibility tree beside it as `<name>.aria.yml`,
and prints the tree (a readable text outline of the page), console errors, and
failed requests. Write routes without the leading slash; Git Bash rewrites `/path`
arguments into file paths. Flags (`--login`, `--password`, `--mobile`, `--out`, `--base`, `--api`) may
come before or after the route; an unknown flag, a flag with no value, or a second
route stops with the usage text instead of snapshotting another page. Use it to
reproduce a bug before fixing it and to show the fix afterwards.

To click through a flow, record it, or read the network and console as you go, an agent
drives Chrome with the `verify-web` skill ([agent tooling](agent-workflow.md#agent-tooling)).

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
pnpm run test:local-d1    # local D1 fixture integration (20 s per test: each starts a real local D1)
pnpm run test:smoke       # @smoke browser specs on an isolated stack
pnpm run test:e2e:full    # every browser spec on the same stack
pnpm run test:coverage
```

The browser tests run the production build: `test:smoke` and `test:e2e:full` build it
with OpenNext and `SITE_ENV=production`, wipe, migrate and seed their own D1 in
`.wrangler/smoke-state`, and serve the build with `opennextjs-cloudflare preview` (workerd)
on a free port from `4173` (`tests/e2e/run-smoke.mjs`, `tests/e2e/preview-server.mjs`). Pass
`-- --skip-build` to reuse the build in `.open-next/`, made with
`SITE_ENV=production pnpm run build:worker` (the runner refuses one made for another
environment). `pnpm run preview` and `next dev` run without `SITE_ENV`, as a non-production
site: noindex, crawlers disallowed, no Tag Manager
([RELIABILITY.md](../RELIABILITY.md#environments-and-hosts)). They run on one Playwright
worker: one workerd process renders every page and prefetch. `pnpm exec playwright test`
serves the existing build on your own local D1.

Browser failures keep a trace, video, and screenshot under `tests/test-results/`;
open a trace with `pnpm exec playwright show-trace <path>/trace.zip`. Each failure
also has an `error-context.md` with the page snapshot at the moment it failed.
Testing conventions are in [RELIABILITY.md](../RELIABILITY.md#testing-conventions).

## Verify an Organization flow by hand

1. Sign in as `admin@test.com` and create an Organization at `/dashboard/settings/`.
2. Create a link invite for another seeded or newly registered email.
3. In a separate browser context, sign in as the invitee.
4. Open `/team-invites/:token/` (legacy route) and click **Accept invite**, or accept from
   the incoming invites on `/dashboard/settings/`.
5. Switch to the Organization and confirm Personal data stays separate.

## All scripts

| Area | Scripts |
| --- | --- |
| Run | `setup`, `dev`, `dev:all`, `dev:api`, `dev:auto`, `dev:stop`, `build`, `build:worker`, `preview`, `cf-typegen`, `ui:snap` |
| Checks | `verify`, `verify:release`, `lint`, `typecheck`, `typecheck:env`, `check:repo`, `docs:check`, `deps:check`, `secret:scan`, `schema:portable:check`, `templates:check`, `db:schema:check`, `sitemap:check`, `maintenance:report`, `sre:dup` |
| Tests | `test`, `test:run`, `test:unit`, `test:local-d1`, `test:coverage`, `test:smoke`, `test:e2e`, `test:e2e:full`, `test:e2e:ui` |
| Generators | `schema:portable:generate`, `db:schema:generate`, `sitemap:generate`, `headers:generate` (the build's `public/_headers`), `templates:generate`, `templates:render-markdown`, `docs:references` |
| Local D1 | `d1:profile`, `db:reset`, `db:seed`, `db:seed:official:local`, `db:migrate:d1:local`, `db:migrations:list:local`, `db:query`, `db:cleanup:local`, `db:reset:test-user-passwords`, `db:generate`, `check:db:drizzle-parity` |
| Remote D1 | `verify:staging`, `verify:prod:d1`, `db:migrate:d1:staging`, `db:migrate:d1:prod`, `db:migrations:*`, `check:*:d1-schema`, `check:preview:d1-binding`, `db:seed:official:staging`, `db:seed:official:remote` |
| Stripe (test mode) | `stripe:local:setup`, `stripe:local:listen`, `stripe:local:scrub-live`, `stripe:portal:configure` |
| Promotion | `promote:prepare` (the staging to main promotion branch; see [agent workflow](agent-workflow.md)) |

## Writing scripts

Scripts under `scripts/`, `tests/e2e/` and `tests/integration/` start tools through
`scripts/lib/run-tool.mjs`: `execTool`/`spawnTool` run a dependency's bin script
(wrangler, next, opennextjs-cloudflare, tsx, playwright, drizzle-kit) with the current Node,
and `execPnpm` runs pnpm itself through the pnpm that launched the script. Never
spawn `npx` or `pnpm` by name: on Windows they are `.cmd` shims, so a spawn without a
shell fails with `ENOENT` (or `EINVAL` for `npx.cmd`), and passing arguments through
a shell lets `cmd.exe` reinterpret characters such as `&`, `^` and `%` in values like
the auth secret. `tests/unit/scripts/tool-spawns.test.ts` fails when a script names
`npx` or `pnpm` as a command. `opennextjs-cloudflare preview` itself hands its extra
arguments to `wrangler dev` through a shell without quoting them, so the smoke runner
passes it only plain values (`buildPreviewArgs` in `tests/e2e/run-smoke-lib.mjs`).

## Line endings

`.gitattributes` checks every text file out with LF (`* text=auto eol=lf`) and marks
fonts and images as binary, so a Windows clone gets LF even with Git for Windows'
default `core.autocrlf=true`. Generators always write LF. The `--check` scripts
(`db:schema:check`, `schema:portable:check`, `sitemap:check`) and `templates:check`
compare through `scripts/lib/line-endings.mjs`, which ignores CRLF versus LF but
still fails on any other difference, including a missing final newline.
`tests/unit/scripts/line-endings.test.ts` fails if a binary file is not marked
binary or a CRLF file reaches the index.

A clone made before `.gitattributes` existed keeps its CRLF files until they are
checked out again. Commit or stash your work first, because this discards
uncommitted changes: `git rm -rq --cached . && git reset --hard`.
