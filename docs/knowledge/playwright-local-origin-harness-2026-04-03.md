# Playwright local origin harness (2026-04-03)

## Problem

Local browser verification was unreliable because Playwright defaulted to `http://localhost:8080` and reused whatever was already listening there.

That created two different failures:

- route verification could attach to a stale frontend instead of the current repo
- moving the frontend to another port caused auth/CORS failures because Better Auth and API CORS were not reading the same configured origin list

## Fix

- Vite dev server now supports an env-driven port and fails fast with `strictPort: true`
- Playwright now starts its own isolated frontend on `http://localhost:4173`
- Playwright also starts the local API on `http://localhost:8788`
- Playwright reuses an already-running local frontend/API on those ports by default for local development, but keeps the old "start fresh" behavior in CI unless `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` is set explicitly
- The Playwright API command passes `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` to Wrangler as explicit `-b` bindings so the Worker sees the isolated origin allowlist during the run
- those injected binding values must stay shell-quoted because `CORS_ALLOWED_ORIGINS` can legitimately contain comma-and-space lists
- Better Auth trusted origins now reuse the same configured origin list as API CORS:
  - request origin
  - `FRONTEND_URL`
  - `CORS_ALLOWED_ORIGINS`

## Local contract

- manual/local frontend can stay on `http://localhost:8080`
- Playwright frontend runs on `http://localhost:4173`
- local API runs on `http://localhost:8788`
- `CORS_ALLOWED_ORIGINS` should include both frontend origins when both are in use
- keeping Playwright on `localhost` avoids `SameSite=Lax` cookie drops that happen when the frontend host is `127.0.0.1` but the API host is `localhost`

Example local env:

```env
FRONTEND_URL=http://localhost:8080
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:4173
VITE_API_URL=http://localhost:8788/api
```

## Why this matters

- route and auth E2E verification no longer depends on ambient services on the developer machine
- the API trust model and the CORS allowlist now stay aligned instead of drifting independently
- future browser verification can prove real app behavior without needing ad hoc port changes
