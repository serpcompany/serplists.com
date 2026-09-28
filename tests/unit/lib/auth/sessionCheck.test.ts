import { describe, expect, it, vi } from 'vitest';
import {
  checkSessionWithRetry,
  createSessionRechecker,
  isSameSessionUser,
  classifySessionResult,
  requireAuthState,
} from '@/lib/auth/sessionCheck';

const signedInResult = {
  data: { user: { id: 'user-1', email: 'john@test.com' }, session: { id: 'session-1' } },
  error: null,
};

describe('classifySessionResult', () => {
  it('treats a returned user as signed in', () => {
    const outcome = classifySessionResult(signedInResult);
    expect(outcome.kind).toBe('authenticated');
    if (outcome.kind === 'authenticated') {
      expect(outcome.user.id).toBe('user-1');
      expect(outcome.session).toBe(signedInResult.data);
    }
  });

  it('treats a successful empty answer or a 401 as signed out', () => {
    expect(classifySessionResult({ data: null, error: null }).kind).toBe('anonymous');
    expect(classifySessionResult({ data: null, error: { status: 401 } }).kind).toBe('anonymous');
  });

  it.each([429, 500, 503, 0])('treats status %s as unknown, never as signed out', (status) => {
    expect(classifySessionResult({ data: null, error: { status } })).toEqual({
      kind: 'unknown',
      status,
    });
  });

  it('treats a missing result as unknown', () => {
    expect(classifySessionResult(undefined).kind).toBe('unknown');
  });
});

describe('checkSessionWithRetry', () => {
  const noSleep = () => Promise.resolve();

  it('retries a rate-limited check and keeps the user signed in', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { status: 429 } })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(signedInResult);

    const outcome = await checkSessionWithRetry(getSession, { delaysMs: [1, 1, 1], sleep: noSleep });

    expect(outcome.kind).toBe('authenticated');
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it('stops at the first definite answer', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: null, error: null });

    const outcome = await checkSessionWithRetry(getSession, { delaysMs: [1, 1], sleep: noSleep });

    expect(outcome.kind).toBe('anonymous');
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('reports unknown, not signed out, when every attempt fails', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: null, error: { status: 503 } });
    const sleep = vi.fn(() => Promise.resolve());

    const outcome = await checkSessionWithRetry(getSession, { delaysMs: [10, 20], sleep });

    expect(outcome).toEqual({ kind: 'unknown', status: 503 });
    expect(getSession).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('stops retrying once cancelled', async () => {
    let cancelled = false;
    const getSession = vi.fn(async () => {
      cancelled = true;
      return { data: null, error: { status: 500 } };
    });

    await checkSessionWithRetry(getSession, {
      delaysMs: [1, 1, 1],
      sleep: noSleep,
      isCancelled: () => cancelled,
    });

    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe('requireAuthState', () => {
  it('only redirects to login on a definite signed-out answer', () => {
    expect(requireAuthState({ isLoading: true, isAuthenticated: false, sessionUnavailable: false })).toBe(
      'loading',
    );
    expect(requireAuthState({ isLoading: false, isAuthenticated: true, sessionUnavailable: false })).toBe(
      'allowed',
    );
    expect(requireAuthState({ isLoading: false, isAuthenticated: false, sessionUnavailable: true })).toBe(
      'unavailable',
    );
    expect(requireAuthState({ isLoading: false, isAuthenticated: false, sessionUnavailable: false })).toBe(
      'redirect',
    );
  });
});

describe('createSessionRechecker', () => {
  function setup(results: unknown[]) {
    let clock = 0;
    const getSession = vi.fn();
    for (const result of results) {
      if (result instanceof Error) getSession.mockRejectedValueOnce(result);
      else getSession.mockResolvedValueOnce(result);
    }
    const onResult = vi.fn();
    const recheck = createSessionRechecker({
      getSession,
      onResult,
      minIntervalMs: 1000,
      now: () => clock,
    });
    return { getSession, onResult, recheck, advance: (ms: number) => (clock += ms) };
  }

  it('re-checks the session once per window, however often the tab regains focus', async () => {
    const { getSession, onResult, recheck, advance } = setup([signedInResult, signedInResult]);

    expect(await recheck()).toBe(false);
    advance(999);
    expect(await recheck()).toBe(false);
    advance(1);
    expect(await recheck()).toBe(true);
    expect(await recheck()).toBe(false);
    advance(1000);
    expect(await recheck()).toBe(true);

    expect(getSession).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls.map(([outcome]) => outcome.kind)).toEqual(['authenticated', 'authenticated']);
  });

  it('does not start a second check while one is in flight', async () => {
    const { getSession, recheck, advance } = setup([signedInResult]);
    advance(1000);

    const [first, second] = await Promise.all([recheck(), recheck()]);

    expect([first, second]).toEqual([true, false]);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure as unknown and an expired session as signed out', async () => {
    const { onResult, recheck, advance } = setup([new TypeError('Failed to fetch'), { data: null, error: null }]);

    advance(1000);
    await recheck();
    advance(1000);
    await recheck();

    expect(onResult.mock.calls.map(([outcome]) => outcome.kind)).toEqual(['unknown', 'anonymous']);
  });
});

describe('isSameSessionUser', () => {
  it('compares the fields the app reads', () => {
    const user = { id: 'user-1', email: 'john@test.com', name: 'John', image: null, username: 'john' };
    expect(isSameSessionUser(user, { ...user })).toBe(true);
    expect(isSameSessionUser(user, { ...user, name: 'Johnny' })).toBe(false);
    expect(isSameSessionUser(null, user)).toBe(false);
  });
});
