# Adaptive local dev launcher (2026-04-03)

## Problem

The local dev scripts originally assumed fixed ports:

- frontend on `http://localhost:8080`
- API on `http://localhost:8788`

That broke in two ways:

- `pnpm dev`, `pnpm dev:api`, and `pnpm dev:all` would fail immediately when either default port was already occupied
- if only one side adapted, frontend and API could drift onto different ports and break auth/CORS locally

## Fix

Moved the adaptive port logic behind the normal local dev scripts.

What it does:

- checks whether `8080` and `8788` are available
- if both are free, it uses the default pair
- if either is occupied, it moves both together to the next open pair
- stores the chosen pair in `tmp/dev-session.json` so `pnpm dev` and `pnpm dev:api` reuse the same ports when started separately
- preserves the `dev:all` owner in that session file, so a temporary `pnpm dev` or `pnpm dev:api` command does not wipe the shared pair while the combined server is still alive
- prints the chosen frontend and API URLs before startup
- rewires `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `PORT`, and `VITE_API_URL` together so auth and CORS stay aligned

Example fallback:

- default pair busy -> frontend `http://localhost:8081`
- matching API -> `http://localhost:8789/api`

## When to use what

- `pnpm dev`
  - frontend-only local development
  - reuses the API session pair if `pnpm dev:api` is already running
  - if the requested frontend is already being served by `pnpm dev:all`, it exits cleanly after printing the live URLs instead of trying to bind the same port again
- `pnpm dev:api`
  - API-only local development
  - reuses the frontend session pair if `pnpm dev` is already running
  - if the requested API is already being served by `pnpm dev:all`, it exits cleanly after printing the live URLs instead of trying to bind the same port again
- `pnpm dev:all`
  - normal local workflow for both services
  - uses the default pair when free and falls back together when needed
- `pnpm dev:auto`
  - alias of `pnpm dev:all`

## Important constraint

These adaptive scripts are still not the automation path.

- Playwright keeps its own isolated harness
- local test automation should not depend on `tmp/dev-session.json`
- this keeps human local development flexible without introducing hidden drift into verification
