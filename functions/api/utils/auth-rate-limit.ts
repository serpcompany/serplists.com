import { checkRateLimit, type RateLimitResult } from './rate-limit';
import { rateLimitKeyForIp } from './rate-limit-key';

/**
 * Auth routes use two per-IP buckets (an IPv6 client is counted per /64, see
 * rate-limit-key.ts) so that routine session checks can never lock a signed-in
 * user out, and so that sign-in attempts can never be hidden among session checks.
 *
 * - `session`: the read-only checks the app makes on every page load. Only the
 *   exact method + path pairs below qualify.
 * - `credential`: everything else under `auth` (sign-in, sign-up, password
 *   reset, verification links, username checks, and any endpoint a future
 *   Better Auth plugin adds). This is deny-by-default: a route must be listed
 *   in SESSION_READ_ROUTES to leave the tight bucket.
 */
const SESSION_READ_ROUTES = new Set(['GET auth/get-session', 'GET auth/status']);

export type AuthRateLimitBucket = 'session' | 'credential';

type Limit = { windowMs: number; max: number };

const LIMITS: Record<AuthRateLimitBucket, { deployed: Limit; local: Limit }> = {
  // Each session check reads D1, so keep a cap to bound scraping.
  session: {
    deployed: { windowMs: 5 * 60 * 1000, max: 600 },
    local: { windowMs: 5 * 60 * 1000, max: 600 },
  },
  credential: {
    deployed: { windowMs: 5 * 60 * 1000, max: 30 },
    local: { windowMs: 60 * 60 * 1000, max: 300 },
  },
};

const BUCKET_KEY_PREFIX: Record<AuthRateLimitBucket, string> = {
  session: 'auth-session',
  credential: 'auth',
};

/**
 * Returns the bucket for an API path (without the `/api/` prefix), or null
 * when the path is not an auth route. `path` must come from `URL.pathname`,
 * so it has no query string and dot segments are already resolved.
 */
export function authRateLimitBucket(method: string, path: string): AuthRateLimitBucket | null {
  if (!path.startsWith('auth')) return null;
  return SESSION_READ_ROUTES.has(`${method.toUpperCase()} ${path}`) ? 'session' : 'credential';
}

export function checkAuthRateLimit(params: {
  method: string;
  path: string;
  ip: string;
  isLocal: boolean;
}): RateLimitResult | null {
  const bucket = authRateLimitBucket(params.method, params.path);
  if (!bucket) return null;
  const limit = params.isLocal ? LIMITS[bucket].local : LIMITS[bucket].deployed;
  return checkRateLimit(`${BUCKET_KEY_PREFIX[bucket]}:${rateLimitKeyForIp(params.ip)}`, limit);
}
