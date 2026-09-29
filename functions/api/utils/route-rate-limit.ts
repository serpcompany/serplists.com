import { checkRateLimit, type RateLimitResult } from './rate-limit';
import { rateLimitKeyForIp } from './rate-limit-key';
import { jsonError } from './response';

/**
 * Per-IP limits (an IPv6 client is counted per /64, see rate-limit-key.ts) for
 * state-changing API routes outside `auth`, which auth-rate-limit.ts owns. Every
 * route family the router dispatches must either fall in a bucket here or be
 * listed in RATE_LIMIT_EXEMPT_ROUTES with a reason;
 * tests/unit/functions/api/route-rate-limit.test.ts reads the router to enforce it.
 *
 * - `write`: ordinary writes (templates, runs, uploads, Organizations, Run Key management).
 * - `admin`: every request under /api/admin, whatever its method. The endpoint checks a
 *   secret that grants plans without payment, so every request counts as a guess.
 * - `billing`: checkout and portal, which each call Stripe. Stripe's rate limit is
 *   shared by the whole account, so one client must not be able to spend it.
 * - `mcp`: every MCP call. MCP is JSON-RPC over POST, so reads count too; keeping it
 *   apart stops a local agent from using up its owner's web-save budget on the same
 *   IP. It is the only limit on calls with a bad Run Key (each costs a D1 lookup),
 *   and it sits above the handler's per-key limit so one key's full budget fits.
 */
export type RouteRateLimitBucket = 'write' | 'admin' | 'billing' | 'mcp';

type Limit = { windowMs: number; max: number };

const LIMITS: Record<RouteRateLimitBucket, { deployed: Limit; local: Limit }> = {
  write: {
    deployed: { windowMs: 60 * 1000, max: 120 },
    local: { windowMs: 60 * 1000, max: 120 },
  },
  admin: {
    deployed: { windowMs: 60 * 1000, max: 10 },
    // Local and e2e runs share 127.0.0.1.
    local: { windowMs: 60 * 1000, max: 120 },
  },
  billing: {
    deployed: { windowMs: 60 * 1000, max: 10 },
    // Local and e2e runs share 127.0.0.1.
    local: { windowMs: 60 * 1000, max: 120 },
  },
  // Twice the per-Run Key limit in agentMcp.ts (120 a minute).
  mcp: {
    deployed: { windowMs: 60 * 1000, max: 240 },
    local: { windowMs: 60 * 1000, max: 240 },
  },
};

export const ROUTE_RATE_LIMIT_MESSAGES: Record<RouteRateLimitBucket, string> = {
  write: 'Too many requests',
  admin: 'Too many requests',
  billing: 'Too many billing requests. Please try again in a minute.',
  mcp: 'Rate limit exceeded',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Prefixes match the router's own dispatch (`path.startsWith(...)`), so every
// request a handler receives is counted.
const WRITE_PREFIXES = ['templates', 'checklists', 'uploads', 'teams'];

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
 * the request is not limited here. Reads such as GET billing/status are not limited;
 * admin requests are, whatever their method.
 */
export function routeRateLimitBucket(method: string, path: string): RouteRateLimitBucket | null {
  if (path.startsWith('admin')) return 'admin';
  if (!MUTATING_METHODS.has(method.toUpperCase())) return null;
  if (path.startsWith('billing')) return 'billing';
  if (path === 'mcp') return 'mcp';
  if (WRITE_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'write';
  if (path === 'agent-keys' || path.startsWith('agent-keys/')) return 'write';
  return null;
}

/**
 * The 429 for a limited route. MCP clients get the same JSON-RPC error shape as
 * the handler's own per-key limit; everything else gets the usual `{ error }`.
 */
export function routeRateLimitResponse(bucket: RouteRateLimitBucket, retryAfterSeconds: number): Response {
  const response =
    bucket === 'mcp'
      ? Response.json(
          { jsonrpc: '2.0', id: null, error: { code: -32000, message: ROUTE_RATE_LIMIT_MESSAGES.mcp } },
          { status: 429, headers: { 'Cache-Control': 'no-store' } },
        )
      : jsonError(ROUTE_RATE_LIMIT_MESSAGES[bucket], 429);
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
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
  return { bucket, result: checkRateLimit(`${bucket}:${rateLimitKeyForIp(params.ip)}`, limit) };
}
