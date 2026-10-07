export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

type RateLimitOptions = { windowMs: number; max: number };

type Entry = { count: number; resetAt: number; max: number };

export const RATE_LIMIT_MAX_KEYS = 10_000;
const SHARE_OF_MAX_KEYS_LEFT_AFTER_EVICTION = 0.9;

export function createRateLimitStore(options: { maxKeys?: number } = {}) {
  const maxKeys = options.maxKeys ?? RATE_LIMIT_MAX_KEYS;
  const evictTo = Math.floor(maxKeys * SHARE_OF_MAX_KEYS_LEFT_AFTER_EVICTION);
  const entries = new Map<string, Entry>();

  function deleteOldest(skipBlocked: boolean) {
    for (const [key, entry] of entries) {
      if (entries.size <= evictTo) return;
      if (skipBlocked && entry.count >= entry.max) continue;
      entries.delete(key);
    }
  }

  function makeRoom(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
    deleteOldest(true);
    deleteOldest(false);
  }

  function startWindowAtBackOfEvictionOrder(key: string, opts: RateLimitOptions, now: number): RateLimitResult {
    entries.delete(key);
    const resetAt = now + opts.windowMs;
    entries.set(key, { count: 1, resetAt, max: opts.max });
    return { allowed: true, remaining: Math.max(0, opts.max - 1), resetAt };
  }

  function check(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const existing = entries.get(key);

    if (!existing || existing.resetAt <= now) {
      if (!existing && entries.size >= maxKeys) makeRoom(now);
      return startWindowAtBackOfEvictionOrder(key, opts, now);
    }

    existing.max = opts.max;
    if (existing.count >= opts.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { allowed: false, remaining: 0, resetAt: existing.resetAt, retryAfterSeconds };
    }

    existing.count += 1;
    return { allowed: true, remaining: Math.max(0, opts.max - existing.count), resetAt: existing.resetAt };
  }

  function isLimited(key: string, max: number): boolean {
    const existing = entries.get(key);
    return existing !== undefined && existing.resetAt > Date.now() && existing.count >= max;
  }

  return {
    check,
    isLimited,
    get size() {
      return entries.size;
    },
  };
}

const store = createRateLimitStore();

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  return store.check(key, opts);
}

export function isRateLimited(key: string, max: number): boolean {
  return store.isLimited(key, max);
}
