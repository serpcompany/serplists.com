import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_MAX_KEYS, checkRateLimit, createRateLimitStore } from '@functions/api/utils/rate-limit';

const MINUTE = 60_000;

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

// The store lives as long as the isolate, and every new client IP adds a key.
describe('rate limit store size', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never holds more than the default cap of keys', () => {
    const store = createRateLimitStore();
    let largest = 0;

    for (let index = 0; index < RATE_LIMIT_MAX_KEYS + 500; index += 1) {
      store.check(`auth:client-${index}`, { windowMs: 5 * MINUTE, max: 30 });
      largest = Math.max(largest, store.size);
    }

    expect(RATE_LIMIT_MAX_KEYS).toBe(10_000);
    expect(largest).toBe(RATE_LIMIT_MAX_KEYS);
    expect(store.size).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
  });

  it('never holds more than a small cap either', () => {
    const store = createRateLimitStore({ maxKeys: 100 });

    for (let index = 0; index < 1_000; index += 1) {
      store.check(`write:${index}`, { windowMs: MINUTE, max: 120 });
      expect(store.size).toBeLessThanOrEqual(100);
    }
  });

  it('drops every expired key once the store is full', () => {
    const store = createRateLimitStore({ maxKeys: 100 });
    for (let index = 0; index < 100; index += 1) {
      store.check(`write:${index}`, { windowMs: MINUTE, max: 120 });
    }

    vi.advanceTimersByTime(MINUTE + 1);
    store.check('write:new', { windowMs: MINUTE, max: 120 });

    expect(store.size).toBe(1);
  });

  it('sweeps an expired short window that sits behind live longer ones', () => {
    const store = createRateLimitStore({ maxKeys: 10 });
    for (let index = 0; index < 5; index += 1) {
      store.check(`auth:${index}`, { windowMs: 5 * MINUTE, max: 30 });
    }
    for (let index = 0; index < 5; index += 1) {
      store.check(`write:${index}`, { windowMs: MINUTE, max: 120 });
    }

    vi.advanceTimersByTime(2 * MINUTE);
    store.check('write:new', { windowMs: MINUTE, max: 120 });

    expect(store.size).toBe(6);
    // The live 5-minute windows kept their counts.
    expect(store.check('auth:0', { windowMs: 5 * MINUTE, max: 30 }).remaining).toBe(28);
  });

  it('keeps a blocked client blocked while a flood of new keys overflows the store', () => {
    const store = createRateLimitStore({ maxKeys: 100 });
    const limit = { windowMs: 5 * MINUTE, max: 3 };
    for (let attempt = 0; attempt < 3; attempt += 1) store.check('auth:attacker', limit);
    expect(store.check('auth:attacker', limit).allowed).toBe(false);

    for (let index = 0; index < 500; index += 1) {
      store.check(`auth:rotating-${index}`, limit);
    }

    expect(store.check('auth:attacker', limit).allowed).toBe(false);
    expect(store.size).toBeLessThanOrEqual(100);
  });

  it('still limits a key after the store has been swept', () => {
    const store = createRateLimitStore({ maxKeys: 10 });
    const limit = { windowMs: MINUTE, max: 2 };
    for (let index = 0; index < 10; index += 1) store.check(`old:${index}`, { windowMs: 1_000, max: 5 });
    vi.advanceTimersByTime(2_000);

    expect(store.check('hot', limit).allowed).toBe(true);
    expect(store.check('hot', limit).allowed).toBe(true);
    expect(store.check('hot', limit).allowed).toBe(false);
  });

  it('moves a renewed window to the back, so the oldest untouched key is evicted first', () => {
    const store = createRateLimitStore({ maxKeys: 10 });
    const limit = { windowMs: 5 * MINUTE, max: 5 };
    store.check('renewed', { windowMs: 1_000, max: 5 });
    for (let index = 0; index < 9; index += 1) store.check(`steady:${index}`, limit);

    vi.advanceTimersByTime(2_000);
    // A new window for the first key inserted.
    expect(store.check('renewed', limit).remaining).toBe(4);

    store.check('newcomer', limit);

    expect(store.size).toBeLessThanOrEqual(10);
    // Still counting its window: it was not the one evicted.
    expect(store.check('renewed', limit).remaining).toBe(3);
    // The oldest untouched key was evicted and starts over.
    expect(store.check('steady:0', limit).remaining).toBe(4);
  });
});
