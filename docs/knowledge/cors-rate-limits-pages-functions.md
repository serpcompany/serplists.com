# CORS + Rate Limits (Cloudflare Pages Functions)

## CORS
The API applies CORS headers in `functions/api/[[route]].ts` via `functions/api/utils/cors.ts`.

Behavior:
- If no allowlist is configured, the API responds with `Access-Control-Allow-Origin: *` (dev-friendly default).
- If an `Origin` header is present and no allowlist is configured, the API reflects the origin and sets `Access-Control-Allow-Credentials: true` (needed for cookie auth in local dev).
- If `FRONTEND_URL` and/or `CORS_ALLOWED_ORIGINS` are set, the API only reflects matching request `Origin` values.
- `OPTIONS` preflight requests return `403` when an allowlist is configured and the `Origin` is not allowed.
- The API exposes `X-Request-Id` for client-side correlation.

Configuration:
- `FRONTEND_URL`: a single frontend URL (origin is extracted and allowlisted).
- `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed origins (each entry must be a valid URL).

### Local verification gotcha
- If Vite cannot bind to `http://localhost:8080` and falls back to another port like `8081`, cookie-authenticated API calls to `http://localhost:8788` will fail CORS when `.dev.vars` still has `FRONTEND_URL=http://localhost:8080`.
- For browser verification, either free up `8080` or update the allowlist before testing from the fallback frontend port.

## Rate limiting
Basic, best-effort rate limiting is applied in `functions/api/[[route]].ts`:
- Every `/api/auth/*` request, including the custom auth-status endpoint and
  current Better Auth routes such as `/api/auth/sign-up/email` and
  `/api/auth/sign-in/email`: 30 requests per 5 minutes per IP on deployed hosts.
- Local `/api/auth/*` requests: 300 requests per hour per IP, which supports
  intensive browser and integration testing while retaining a guardrail.
- Sensitive writes (`POST|PUT|DELETE` under `templates`, `checklists`,
  `uploads`, or the legacy Organization route family `teams`, plus Personal
  Run Key and MCP write endpoints): 120 requests per minute per IP.

Notes:
- The limiter uses an in-memory map (`functions/api/utils/rate-limit.ts`), so it is not globally consistent across all Cloudflare edges.
- If the request IP cannot be determined (missing `CF-Connecting-IP`), the limiter is skipped.
- Rate limiting happens before Better Auth dispatch, so password-reset,
  verification, session, and other `/api/auth/*` calls share the same per-IP
  auth bucket rather than only sign-up and sign-in being covered.
- The MCP handler also applies its own 120-requests-per-minute bucket per
  authenticated Personal Run Key after the router's per-IP check.
