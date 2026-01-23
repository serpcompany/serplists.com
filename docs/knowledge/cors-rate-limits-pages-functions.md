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

## Rate limiting
Basic, best-effort rate limiting is applied in `functions/api/[[route]].ts`:
- `POST /api/auth/register` and `POST /api/auth/login`: 30 requests per 5 minutes per IP.
- Write endpoints (`POST|PUT|DELETE` under `templates|checklists|uploads`): 120 requests per minute per IP.

Notes:
- The limiter uses an in-memory map (`functions/api/utils/rate-limit.ts`), so it is not globally consistent across all Cloudflare edges.
- If the request IP cannot be determined (missing `CF-Connecting-IP`), the limiter is skipped.
