# Development

## Requirements
- Node.js and pnpm
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
pnpm run db:seed
pnpm run db:reset
pnpm run db:reset:test-user-passwords
pnpm run db:query "SELECT * FROM templates LIMIT 5"
```

Local D1 state lives under `.wrangler/state/...`. The `db:reset` script clears that local state and replays migrations.

Drizzle schema lives in `db/schema/` (entry: `db/schema/index.ts`); Drizzle Kit config in `db/drizzle.config.ts`.

## Dev login (local dummy users)
In development mode (`import.meta.env.DEV`), two helpers are available:
- `DevLoginBar` (fixed bar at the bottom of the app)
- Quick-fill buttons on the `/login` page

These helpers use the test users seeded by `db/migrations/seed-test-data.sql`.

Credentials:
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
2. `pnpm run db:seed` has been executed

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
```

## Git hooks
Hooks are installed via `pnpm install` (prepare). If needed:
```bash
pnpm exec lefthook install
```

If pnpm reports that lefthook build scripts were ignored, run:
```bash
pnpm approve-builds
```
Then re-run the install command above.
