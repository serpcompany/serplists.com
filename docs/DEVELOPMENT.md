# Development

## Requirements
- Node.js and pnpm
- Wrangler (via `npx wrangler` or the dev dependency)

## Environment
Local Pages Functions use `.dev.vars` for server-side variables.

```
JWT_SECRET=local-dev-secret-key-not-for-production-use
# Optional for uploads
R2_PUBLIC_BASE_URL=https://your-public-domain
```

Notes:
- `src/lib/api.ts` defaults the dev API base to `http://localhost:8788/api` and supports `VITE_API_URL` overrides.
- `.env.local` exists in the repo but is not read by the app today.
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
pnpm run test:smoke
pnpm run test:e2e
pnpm run test:e2e:ui
pnpm run typecheck
pnpm run typecheck:env
pnpm run lint
```
