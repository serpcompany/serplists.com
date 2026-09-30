import { getClientIp } from "./logger";
import type { PersonalRunKeyIdentity } from "./personal-run-key";
import { checkRateLimit, isRateLimited } from "./rate-limit";
import { rateLimitKeyForIp } from "./rate-limit-key";

// In-memory per isolate, like the router's limits. The global limit is the Cloudflare WAF
// rule described in docs/SECURITY.md.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;
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
    window = { count: 0, resetsAt: now + RATE_LIMIT_WINDOW_MS };
  }
  window.count += 1;
  rateLimitWindows.set(identity.keyId, window);

  if (rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) {
    for (const [key, candidate] of rateLimitWindows) {
      if (candidate.resetsAt <= now || rateLimitWindows.size > MAX_RATE_LIMIT_KEYS) rateLimitWindows.delete(key);
      if (rateLimitWindows.size <= MAX_RATE_LIMIT_KEYS) break;
    }
  }

  if (window.count <= RATE_LIMIT_REQUESTS) return { allowed: true };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.resetsAt - now) / 1000)) };
}

// Invalid keys cannot be limited per key, and each lookup reads D1, so an IP that keeps
// failing is refused before the lookup. Skipped when CF-Connecting-IP is missing. An IPv6
// client is counted per /64, like the router's limits, so rotating addresses inside its own
// network does not reset the count.
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
