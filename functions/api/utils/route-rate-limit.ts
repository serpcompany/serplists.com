import { checkRateLimit, type RateLimitResult } from './rate-limit';

/**
 * Per-IP limits for state-changing API routes outside `auth`, which
 * auth-rate-limit.ts owns. Every route family the router dispatches must either
 * fall in a bucket here or be listed in RATE_LIMIT_EXEMPT_ROUTES with a reason;
 * tests/unit/functions/api/route-rate-limit.test.ts reads the router to enforce it.
 *
 * - `write`: ordinary writes (templates, runs, uploads, Organizations, Run Keys, MCP, admin).
 * - `billing`: checkout and portal, which each call Stripe. Stripe's rate limit is
 *   shared by the whole account, so one client must not be able to spend it.
 */
export type RouteRateLimitBucket = 'write' | 'billing';

type Limit = { windowMs: number; max: number };

const LIMITS: Record<RouteRateLimitBucket, { deployed: Limit; local: Limit }> = {
  write: {
    deployed: { windowMs: 60 * 1000, max: 120 },
    local: { windowMs: 60 * 1000, max: 120 },
  },
  billing: {
    deployed: { windowMs: 60 * 1000, max: 10 },
    // Local and e2e runs share 127.0.0.1.
    local: { windowMs: 60 * 1000, max: 120 },
  },
};

export const ROUTE_RATE_LIMIT_MESSAGES: Record<RouteRateLimitBucket, string> = {
  write: 'Too many requests',
  billing: 'Too many billing requests. Please try again in a minute.',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Prefixes match the router's own dispatch (`path.startsWith(...)`), so every
// request a handler receives is counted.
const WRITE_PREFIXES = ['templates', 'checklists', 'uploads', 'teams', 'admin'];

/** Route families the router dispatches that are deliberately not limited here. */
export const RATE_LIMIT_EXEMPT_ROUTES: Record<string, string> = {
  auth: 'auth-rate-limit.ts limits every /api/auth route',
  health: 'read-only',
  'profiles/by-username': 'read-only',
  'profiles/by-id': 'read-only',
  stripe:
    'signed Stripe webhooks arrive in bursts from a few shared IPs, and a 429 would delay subscription changes',
};

/**
 * Returns the bucket for an API path (without the `/api/` prefix), or null when
 * the request is not limited here. Reads such as GET billing/status are never limited.
 */
export function routeRateLimitBucket(method: string, path: string): RouteRateLimitBucket | null {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return null;
  if (path.startsWith('billing')) return 'billing';
  if (WRITE_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'write';
  if (path === 'agent-keys' || path.startsWith('agent-keys/') || path === 'mcp') return 'write';
  return null;
}

export function checkRouteRateLimit(params: {
  method: string;
  path: string;
  ip: string;
  isLocal: boolean;
}): { bucket: RouteRateLimitBucket; result: RateLimitResult } | null {
  const bucket = routeRateLimitBucket(params.method, params.path);
  if (!bucket) return null;
  const limit = params.isLocal ? LIMITS[bucket].local : LIMITS[bucket].deployed;
  return { bucket, result: checkRateLimit(`${bucket}:${params.ip}`, limit) };
}
