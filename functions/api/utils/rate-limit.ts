export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export function checkRateLimit(key: string, opts: { windowMs: number; max: number }): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + opts.windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, opts.max - 1), resetAt };
  }

  if (existing.count >= opts.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetAt: existing.resetAt, retryAfterSeconds };
  }

  existing.count += 1;
  store.set(key, existing);
  return { allowed: true, remaining: Math.max(0, opts.max - existing.count), resetAt: existing.resetAt };
}

