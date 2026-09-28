import type { Env } from '../types';
import { parseAllowedOrigin, parseOriginList } from './origin-list';

/**
 * The valid http(s) origins from FRONTEND_URL and CORS_ALLOWED_ORIGINS. Invalid
 * entries are dropped here and rejected by getApiEnv, so a request fails with
 * a configuration error; this list never contains the opaque "null" origin.
 */
export function resolveConfiguredCorsOrigins(env: Env): string[] {
  const allowed = new Set<string>();

  if (env.FRONTEND_URL) {
    const origin = parseAllowedOrigin(env.FRONTEND_URL);
    if (origin) allowed.add(origin);
  }

  if (env.CORS_ALLOWED_ORIGINS) {
    for (const origin of parseOriginList(env.CORS_ALLOWED_ORIGINS).origins) allowed.add(origin);
  }

  return Array.from(allowed);
}

/** True when either allowlist variable is set, even if nothing valid came out of it. */
function hasConfiguredCorsAllowlist(env: Env): boolean {
  return Boolean(env.FRONTEND_URL?.trim() || env.CORS_ALLOWED_ORIGINS?.trim());
}

/**
 * Origins trusted to make authenticated, state-changing requests: the API's own
 * origin plus FRONTEND_URL and CORS_ALLOWED_ORIGINS. Unlike resolveCorsOrigin,
 * an empty allowlist does not mean "any origin".
 */
export function resolveTrustedOrigins(request: Request, env: Env): Set<string> {
  return new Set([new URL(request.url).origin, ...resolveConfiguredCorsOrigins(env)]);
}

/**
 * The Access-Control-Allow-Origin value for a request, or null for none. With
 * no allowlist configured (local dev), any Origin is reflected. Once either
 * variable is set, only listed origins are, even when the value was malformed
 * and yielded none. The opaque Origin "null" (sandboxed frames, file: pages) is
 * never reflected, because it would come with credentials.
 */
export function resolveCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return '*';
  if (origin === 'null') return null;

  if (!hasConfiguredCorsAllowlist(env)) return origin;
  return resolveConfiguredCorsOrigins(env).includes(origin) ? origin : null;
}

export function applyCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = resolveCorsOrigin(request, env);
  if (!origin) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Request-Id, X-CSRF-Token, X-Requested-With'
  );
  response.headers.set('Access-Control-Expose-Headers', 'X-Request-Id');

  if (origin !== '*') {
    response.headers.append('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export function buildCorsPreflightResponse(request: Request, env: Env): Response {
  const origin = resolveCorsOrigin(request, env);
  if (!origin && request.headers.get('Origin')) {
    return new Response(null, { status: 403 });
  }

  const response = new Response(null, { status: 200 });
  return applyCorsHeaders(response, request, env);
}
