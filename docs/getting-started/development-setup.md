# Development

## Requirements
- Node.js 22
- pnpm 9
- Wrangler (via `npx wrangler` or the dev dependency)

## Environment
Use `.dev.vars` as the single local env file for both Vite scripts and Pages Functions.

Copy `.dev.vars.example` to `.dev.vars` and fill values.

```
BETTER_AUTH_SECRET=local-dev-secret-key-not-for-production-use-at-least-32-chars
# Required to test paid/Pro locally
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
# Optional for uploads
R2_PUBLIC_BASE_URL=https://your-public-domain
# Optional for production CORS allowlisting
FRONTEND_URL=https://your-frontend-domain
# Optional: comma-separated additional allowed origins
CORS_ALLOWED_ORIGINS=https://your-frontend-domain,https://www.your-frontend-domain
# Deprecated (legacy auth only)
JWT_SECRET=legacy-jwt-secret
# Optional client override
VITE_API_URL=http://localhost:8788/api
```

Notes:
- `src/lib/api.ts` defaults the dev API base to `http://localhost:8788/api` and supports `VITE_API_URL` overrides.
- `.env` and `.env.local` are deprecated; keep local env values only in `.dev.vars`.
- Client-side env validation lives in `src/env.ts` (Vite `VITE_` prefix). Optional: `VITE_API_URL` to override the API base.

## Run the app
```bash
pnpm install
pnpm run dev        # Vite dev server (http://localhost:8080)
pnpm run dev:api    # Pages Functions dev server (http://localhost:8788)
pnpm run dev:all    # Runs both in parallel
```

`pnpm run dev:api` serves from `dist/`. If `dist/` does not exist, run `pnpm run build` first.

### Adaptive local ports

The normal development commands coordinate the frontend and API as a port
pair. They prefer `8080` and `8788`; if either is occupied, both move together
to the next available pair. The selected URLs are printed at startup and saved
in `tmp/dev-session.json` so separately started frontend and API commands reuse
the same pair. `pnpm run dev:auto` is an alias for `pnpm run dev:all`.

The launcher updates `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `PORT`, and
`VITE_API_URL` together. Do not hand-adjust only one side after a fallback,
because Better Auth trusted origins and API CORS must match the frontend origin.
The session file is local coordination state, not an automation interface.

## Local database (D1)
```bash
pnpm run db:migrate:d1:local
pnpm run db:seed
pnpm run db:seed:official:local
pnpm run db:reset
pnpm run db:migrations:list:local
pnpm run db:reset:test-user-passwords
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

Local D1 state lives under `.wrangler/state/...`. The `db:seed` script seeds local test Users, sample Organization data, pending invites, Organization entitlement overrides, audit rows, and the official `serp` publisher/Templates. The fixtures retain legacy `team` implementation names. The `db:reset` script clears local state, applies tracked D1 migrations through Wrangler, and then runs those same local seeds.

Drizzle schema lives in `db/schema/` (entry: `db/schema/index.ts`); Drizzle Kit config in `db/drizzle.config.ts`.

The official local publisher seed creates:
- username `serp`
- display name `SERP`
- a small set of official public templates owned by that account

The local Organization seed creates data for verifying:
- ownership-context switching
- Organization Membership display
- pending incoming invites
- invite acceptance
- Organization entitlement behavior
- Organization audit/activity history

## Remote database commands
Use the staging/preview database before production. Preview deployments must not point to production D1.

```bash
pnpm run verify:staging
pnpm run db:migrate:d1:staging
pnpm run db:seed:official:staging
pnpm run check:staging:d1-schema
```

Production commands:

```bash
pnpm run verify:prod:d1
pnpm run db:migrate:d1:prod
pnpm run check:prod:d1-schema
```

See [Database environments](../operations/database-environments.md) before changing remote D1 configuration or applying production migrations.

## Dev login (local dummy users)
In development mode (`import.meta.env.DEV`), two helpers are available:
- `DevLoginBar` (fixed bar at the bottom of the app)
- Quick-fill buttons on the `/login` page

These helpers use the users seeded by `pnpm run db:seed`.

Credentials:
- checklists@serp.co
- admin@test.com
- john@test.com
- jane@test.com
- bob@test.com

Password for all: `password123`

If you changed a seeded persona password locally and want the quick-login helpers to work again, run:

```bash
pnpm run db:reset:test-user-passwords
```

If login fails, verify:
1. `pnpm run dev:api` is running on port 8788
2. `pnpm run db:seed` or `pnpm run db:reset` has been executed
3. the browser is talking to `http://localhost:8788/api` or the intended `VITE_API_URL`

Repeated auth POST/PUT requests can also reach the local per-IP allowance of
300 requests per hour and return `429 Too Many Requests`. If a seeded-persona
login unexpectedly fails during intensive QA, check the API response and logs
for `429` before resetting credentials or debugging session state. Production
keeps the stricter auth limit.

## Organization flow verification
Use `/dashboard/settings` for Organization creation, management, and incoming invites.

Useful local flow:

1. Log in with `admin@test.com` and create an Organization from `/dashboard/settings`.
2. Create a link invite for another seeded or newly registered email.
3. Log out or use a separate browser context.
4. Register or log in as the invitee.
5. Accept from the legacy compatibility route `/team-invites/:token` or from incoming invites on `/dashboard/settings`.
6. Confirm the context switcher shows the accepted Organization and that Personal data remains separate.

## Testing and checks
Install Playwright browsers once before running e2e/smoke tests:
```bash
pnpm exec playwright install
```

```bash
pnpm run test
pnpm run test:run
pnpm run test:unit
pnpm run test:coverage
pnpm run test:smoke
pnpm run test:e2e
pnpm run test:e2e:ui
pnpm run typecheck
pnpm run typecheck:env
pnpm run lint
pnpm run secret:scan
pnpm run verify:release
```

Playwright uses an isolated local origin contract instead of the adaptive human
development session:

- frontend: `http://localhost:4173`
- API: `http://localhost:8788`
- local runs may reuse servers on those ports; CI starts fresh unless
  `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` is set
- the Playwright API process receives matching `FRONTEND_URL` and
  `CORS_ALLOWED_ORIGINS` bindings

Include both `http://localhost:8080` and `http://localhost:4173` in the local
origin allowlist when manual development and Playwright run side by side. Keep
both services on the `localhost` host name; mixing `127.0.0.1` with `localhost`
can cause `SameSite=Lax` session cookies to be dropped.

See [Testing reference](../reference/testing.md) for Vitest configuration,
mocking, and environment-safety conventions.

The smoke suite includes route, auth, and Organization coverage. The relevant specs retain legacy `team` filenames:

```bash
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```

## Git hooks
Install the optional local Git hooks explicitly:
```bash
pnpm exec lefthook install
```

If pnpm reports that lefthook build scripts were ignored, run:
```bash
pnpm approve-builds
```
Then re-run the install command above.
