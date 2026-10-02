import { checkRateLimit, type RateLimitResult } from './rate-limit';
import { rateLimitKeyForIp } from './rate-limit-key';

const SESSION_READ_ROUTES = new Set(['GET auth/get-session', 'GET auth/status']);

export type AuthRateLimitBucket = 'session' | 'credential';

type Limit = { windowMs: number; max: number };

const LIMITS: Record<AuthRateLimitBucket, { deployed: Limit; local: Limit }> = {
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
