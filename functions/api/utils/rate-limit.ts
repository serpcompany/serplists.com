export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

type RateLimitOptions = { windowMs: number; max: number };

type Entry = { count: number; resetAt: number; max: number };

/**
 * The most keys one isolate keeps (about 2MB). Every new client IP adds a key
 * and the store lives as long as the isolate, so without a cap a flood of
 * distinct addresses would grow it until the isolate runs out of memory.
 */
export const RATE_LIMIT_MAX_KEYS = 10_000;

/**
 * A fixed-window counter per key, held in memory and bounded by `maxKeys`.
 *
 * When a new key arrives at a full store, every expired window is dropped first
 * (each key's own window: auth, write and local windows differ, so insertion
 * order is not expiry order). If that is not enough, the oldest windows go, and
 * a client that is currently blocked is kept while any other can go. Room is made
 * down to 90% of the cap, so a flood of new keys costs one full pass per thousand
 * or so new keys rather than one per request. An evicted key simply starts a new
 * window (fail open): anyone able to fill the store already controls enough
 * addresses to get around a per-IP limit.
 */
export function createRateLimitStore(options: { maxKeys?: number } = {}) {
  const maxKeys = options.maxKeys ?? RATE_LIMIT_MAX_KEYS;
  const evictTo = Math.floor(maxKeys * 0.9);
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

  function check(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const existing = entries.get(key);

    if (!existing || existing.resetAt <= now) {
      if (existing) {
        // Re-inserting moves a renewed window to the back of the eviction order.
        entries.delete(key);
      } else if (entries.size >= maxKeys) {
        makeRoom(now);
      }
      const resetAt = now + opts.windowMs;
      entries.set(key, { count: 1, resetAt, max: opts.max });
      return { allowed: true, remaining: Math.max(0, opts.max - 1), resetAt };
    }

    existing.max = opts.max;
    if (existing.count >= opts.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { allowed: false, remaining: 0, resetAt: existing.resetAt, retryAfterSeconds };
    }

    existing.count += 1;
    return { allowed: true, remaining: Math.max(0, opts.max - existing.count), resetAt: existing.resetAt };
  }

  return {
    check,
    get size() {
      return entries.size;
    },
  };
}

const store = createRateLimitStore();

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  return store.check(key, opts);
}
