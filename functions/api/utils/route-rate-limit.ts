import { RUN_KEY_REQUESTS_PER_MINUTE } from './mcp-limits';
import { checkRateLimit, type RateLimitResult } from './rate-limit';
import { rateLimitKeyForIp } from './rate-limit-key';
import { jsonError } from './response';

export type RouteRateLimitBucket = 'write' | 'admin' | 'billing' | 'mcp';

type Limit = { windowMs: number; max: number };

const LIMITS: Record<RouteRateLimitBucket, { deployed: Limit; local: Limit }> = {
  write: {
    deployed: { windowMs: 60 * 1000, max: 120 },
    local: { windowMs: 60 * 1000, max: 120 },
  },
  admin: {
    deployed: { windowMs: 60 * 1000, max: 10 },
    local: { windowMs: 60 * 1000, max: 120 },
  },
  billing: {
    deployed: { windowMs: 60 * 1000, max: 10 },
    local: { windowMs: 60 * 1000, max: 120 },
  },
  mcp: {
    deployed: { windowMs: 60 * 1000, max: 2 * RUN_KEY_REQUESTS_PER_MINUTE },
    local: { windowMs: 60 * 1000, max: 2 * RUN_KEY_REQUESTS_PER_MINUTE },
  },
};

export const ROUTE_RATE_LIMIT_MESSAGES: Record<RouteRateLimitBucket, string> = {
  write: 'Too many requests',
  admin: 'Too many requests',
  billing: 'Too many billing requests. Please try again in a minute.',
  mcp: 'Rate limit exceeded',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const RATE_LIMIT_EXEMPT_ROUTES: Record<string, string> = {
  auth: 'auth-rate-limit.ts limits every /api/auth route',
  health: 'read-only',
  'profiles/by-handle': 'read-only',
  'profiles/by-username': 'read-only',
  'profiles/by-id': 'read-only',
  stripe:
    'signed Stripe webhooks arrive in bursts from a few shared IPs, and a 429 would delay subscription changes',
};

const isExemptRoute = (path: string): boolean =>
  Object.keys(RATE_LIMIT_EXEMPT_ROUTES).some((exempt) => path === exempt || path.startsWith(`${exempt}/`));

export function routeRateLimitBucket(method: string, path: string): RouteRateLimitBucket | null {
  if (path.startsWith('admin')) return 'admin';
  if (!MUTATING_METHODS.has(method.toUpperCase())) return null;
  if (path.startsWith('billing')) return 'billing';
  if (path === 'mcp') return 'mcp';
  return isExemptRoute(path) ? null : 'write';
}

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
