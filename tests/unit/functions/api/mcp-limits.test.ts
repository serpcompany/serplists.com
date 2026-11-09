import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failedAuthIsBlocked, limitPersonalRunKey, recordFailedAuth, RUN_KEY_REQUESTS_PER_MINUTE } from '@functions/api/utils/mcp-limits';
import type { PersonalRunKeyIdentity } from '@functions/api/utils/personal-run-key';

const key = (keyId: string): PersonalRunKeyIdentity => ({ keyId, userId: 'user-1', name: 'Agent', permissions: ['runs:read'] });

function useUpItsMinute(keyId: string) {
  for (let request = 0; request < RUN_KEY_REQUESTS_PER_MINUTE; request += 1) limitPersonalRunKey(key(keyId));
}

const mcpRequest = (headers: Record<string, string> = {}) => new Request('https://serplists.com/api/mcp', { method: 'POST', headers });

describe('limitPersonalRunKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a key past its requests for the minute, saying when to retry, and allows it again in the next minute', () => {
    useUpItsMinute('busy');
    vi.advanceTimersByTime(20_000);

    expect(limitPersonalRunKey(key('busy'))).toEqual({ allowed: false, retryAfter: 40 });
    vi.advanceTimersByTime(40_000);
    expect(limitPersonalRunKey(key('busy'))).toEqual({ allowed: true });
  });

  it('keeps at most a thousand keys, forgetting the oldest first, so many keys cannot fill the Worker’s memory', () => {
    useUpItsMinute('oldest');
    for (let other = 0; other < 1_000; other += 1) limitPersonalRunKey(key(`other-${other}`));

    expect(limitPersonalRunKey(key('oldest'))).toEqual({ allowed: true });
  });
});

describe('limitPersonalRunKey when it must forget a key and the oldest has had its minute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forgets the key whose minute has passed, and a busy key stays refused', async () => {
    const limits = await import('@functions/api/utils/mcp-limits');
    limits.limitPersonalRunKey(key('stale'));
    vi.advanceTimersByTime(61_000);
    for (let request = 0; request < limits.RUN_KEY_REQUESTS_PER_MINUTE; request += 1) limits.limitPersonalRunKey(key('busy'));
    for (let other = 0; other < 999; other += 1) limits.limitPersonalRunKey(key(`other-${other}`));

    expect(limits.limitPersonalRunKey(key('busy'))).toEqual({ allowed: false, retryAfter: 60 });
  });
});

describe('failed MCP sign-ins', () => {
  it('blocks an address after ten failed attempts', () => {
    const request = () => mcpRequest({ 'CF-Connecting-IP': '198.51.100.20' });
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedAuth(request());

    expect(failedAuthIsBlocked(request())).toBe(true);
    expect(failedAuthIsBlocked(mcpRequest({ 'CF-Connecting-IP': '198.51.100.21' }))).toBe(false);
  });

  it('cannot count a request that names no address, and so never blocks one', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) recordFailedAuth(mcpRequest());

    expect(failedAuthIsBlocked(mcpRequest())).toBe(false);
  });
});
