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

## Local database (D1)
```bash
pnpm run db:migrate:d1:local
pnpm run db:seed
pnpm run db:reset
pnpm run db:migrations:list:local
pnpm run db:reset:test-user-passwords
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

Local D1 state lives under `.wrangler/state/...`. The `db:seed` script seeds local test users, sample team data, pending team invites, team entitlement overrides, audit rows, and the official `serp` publisher/templates. The `db:reset` script clears local state, applies tracked D1 migrations through Wrangler, and then runs those same local seeds.

Drizzle schema lives in `db/schema/` (entry: `db/schema/index.ts`); Drizzle Kit config in `db/drizzle.config.ts`.

The official local publisher seed creates:
- username `serp`
- display name `SERP`
- a small set of official public templates owned by that account

The local team seed creates data for verifying:
- workspace switching
- team membership display
- pending incoming invites
- invite acceptance
- team entitlement behavior
- team audit/activity history

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

## Team flow verification
Use `/dashboard/settings` for team creation, team management, and incoming invites.

Useful local flow:

1. Log in with `admin@test.com` and create a team from `/dashboard/settings`.
2. Create a link invite for another seeded or newly registered email.
3. Log out or use a separate browser context.
4. Register or log in as the invitee.
5. Accept from `/team-invites/:token` or from incoming invites on `/dashboard/settings`.
6. Confirm the workspace switcher shows the accepted team and that personal workspace data remains separate.

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

The smoke suite includes route/auth/team coverage. Team-specific Playwright specs live in:

```bash
pnpm run test:e2e -- tests/e2e/team-workspace.spec.ts
pnpm run test:e2e -- tests/e2e/team-invite-flow.spec.ts
```

## Git hooks
Use Node 22 (recorded in `.node-version`) and pnpm 9.2.0 (recorded in
`package.json`). Hooks are installed and verified by `pnpm install` through the
`prepare` script. The installer also removes the obsolete `.husky/_`
`core.hooksPath` value before asking Lefthook to install into Git's standard
hooks directory. If needed, rerun the repository installer:
```bash
pnpm run prepare
```

If pnpm reports that lefthook build scripts were ignored, run:
```bash
pnpm approve-builds
```
Then re-run the install command above.

Pre-commit includes the fast migration-provenance and schema-contract checks.
Pre-push adds the adversarial provenance tests, generated schema snapshot, and
full data-regression suite. Git's
`--no-verify` option can bypass local hooks, so local success is advisory; pull
requests are independently enforced by the required CI checks documented in
the operations playbook.
