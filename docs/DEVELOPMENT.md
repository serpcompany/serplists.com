# Development

## Requirements
- Node.js and pnpm
- Wrangler (via `npx wrangler` or the dev dependency)

## Environment
Local Pages Functions use `.dev.vars` for server-side variables.

```
JWT_SECRET=local-dev-secret-key-not-for-production-use
FRONTEND_URL=http://localhost:8080
# Optional for uploads
R2_PUBLIC_BASE_URL=https://your-public-domain
```

Notes:
- `src/lib/api.ts` hard-codes the dev API base to `http://localhost:8788/api`.
- `.env.local` exists in the repo but is not read by the app today.

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
```bash
pnpm run test
pnpm run test:run
pnpm run typecheck
pnpm run lint
```
