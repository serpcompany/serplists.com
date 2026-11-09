import { getClientIp } from "./logger";
import type { PersonalRunKeyIdentity } from "./personal-run-key";
import { checkRateLimit, isRateLimited } from "./rate-limit";
import { rateLimitKeyForIp } from "./rate-limit-key";

const RUN_KEY_WINDOW_MS = 60_000;
export const RUN_KEY_REQUESTS_PER_MINUTE = 120;
const MAX_RATE_LIMIT_KEYS = 1_000;
const FAILED_AUTH_WINDOW_MS = 60_000;
const FAILED_AUTH_ATTEMPTS = 10;

const rateLimitWindows = new Map<string, { count: number; resetsAt: number }>();

export function limitPersonalRunKey(
  identity: PersonalRunKeyIdentity,
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now();
  let window = rateLimitWindows.get(identity.keyId);
  if (!window || window.resetsAt <= now) {
    window = { count: 0, resetsAt: now + RUN_KEY_WINDOW_MS };
  }
  window.count += 1;
  rateLimitWindows.set(identity.keyId, window);

  if (rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) {
    for (const [key, candidate] of rateLimitWindows) {
      if (candidate.resetsAt <= now || rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) rateLimitWindows.delete(key);
      if (rateLimitWindows.size <= MAX_RATE_LIMIT_KEYS) break;
    }
  }

  if (window.count <= RUN_KEY_REQUESTS_PER_MINUTE) return { allowed: true };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)) };
}

function failedAuthKey(request: Request): string | null {
  const ip = getClientIp(request);
  return ip ? `mcp-failed-auth:${rateLimitKeyForIp(ip)}` : null;
}

export function failedAuthIsBlocked(request: Request): boolean {
  const key = failedAuthKey(request);
  return key !== null && isRateLimited(key, FAILED_AUTH_ATTEMPTS);
}

export function recordFailedAuth(request: Request): void {
  const key = failedAuthKey(request);
  if (key) checkRateLimit(key, { windowMs: FAILED_AUTH_WINDOW_MS, max: FAILED_AUTH_ATTEMPTS });
}
