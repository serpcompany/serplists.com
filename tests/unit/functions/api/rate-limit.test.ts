import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@functions/api/utils/rate-limit';

describe('Rate limit utility', () => {
  it('allows up to max then blocks', () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const opts = { windowMs: 60_000, max: 2 };

    const first = checkRateLimit(key, opts);
    expect(first.allowed).toBe(true);

    const second = checkRateLimit(key, opts);
    expect(second.allowed).toBe(true);

    const third = checkRateLimit(key, opts);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});

