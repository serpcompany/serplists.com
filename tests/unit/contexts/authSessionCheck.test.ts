import { describe, expect, it, vi } from 'vitest';

import {
  applySessionCheck,
  checkSessionWithRetry,
  classifySessionResult,
  resolveProtectedRouteAction,
  signUpRequiresEmailVerification,
  type AuthClientResult,
  type SessionState,
} from '@/contexts/authSession';

// Better Auth's getSession resolves every failure as { data: null, error } (status 0 when the
// network failed), and a signed-out visitor as a 200 with a null body: { data: null, error: null }.
const user = { id: 'user-1', email: 'user@example.com', name: 'User One' };
const signedIn: SessionState = { user, session: { user }, status: 'authenticated' };
const signedOut: SessionState = { user: null, session: null, status: 'loading' };

describe('classifySessionResult', () => {
  it.each([
    ['a server error', 503],
    ['the auth rate limit', 429],
    ['a dropped connection', 0],
  ])('does not read %s as signed out', (_name, status) => {
    expect(classifySessionResult({ data: null, error: { status } })).toEqual({ kind: 'unknown', status });
  });

  it('reads a missing result as unknown', () => {
    expect(classifySessionResult(undefined)).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['no session', { data: null, error: null }],
    ['a rejected session refresh', { data: null, error: { status: 401 } }],
  ])('reads %s as signed out', (_name, result) => {
    expect(classifySessionResult(result)).toEqual({ kind: 'unauthenticated' });
  });

  it('reads a session as signed in', () => {
    expect(classifySessionResult({ data: { user, session: { id: 'session-1' } }, error: null })).toMatchObject({
      kind: 'authenticated',
      user,
    });
  });
});

describe('applySessionCheck', () => {
  it('keeps a signed-in user when a profile refresh cannot reach the server', () => {
    expect(applySessionCheck({ kind: 'unknown', status: 500 }, signedIn)).toEqual(signedIn);
  });

  it('reports the session as unavailable, not signed out, when the first check fails', () => {
    expect(applySessionCheck({ kind: 'unknown', status: 503 }, signedOut)).toEqual({
      user: null,
      session: null,
      status: 'unavailable',
    });
  });

  it('signs the user out only on a confirmed answer', () => {
    expect(applySessionCheck({ kind: 'unauthenticated' }, signedIn)).toEqual({
      user: null,
      session: null,
      status: 'unauthenticated',
    });
  });
});

describe('checkSessionWithRetry', () => {
  const wait = vi.fn(async () => {});

  it('retries an unknown answer and returns the session once the server answers', async () => {
    const answers: AuthClientResult[] = [
      { data: null, error: { status: 503 } },
      { data: null, error: { status: 0 } },
      { data: { user, session: {} }, error: null },
    ];
    const getSession = vi.fn(async () => answers.shift());

    await expect(checkSessionWithRetry(getSession, { retryDelaysMs: [10, 20], wait })).resolves.toMatchObject({
      kind: 'authenticated',
    });
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it('retries a rate-limited check and a failed request, and keeps the user signed in', async () => {
    const getSession = vi
      .fn<() => Promise<AuthClientResult>>()
      .mockResolvedValueOnce({ data: null, error: { status: 429 } })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { user, session: {} }, error: null });

    await expect(checkSessionWithRetry(getSession, { retryDelaysMs: [10, 20], wait })).resolves.toMatchObject({
      kind: 'authenticated',
    });
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it('reports the last failure as unknown after waiting out each retry delay', async () => {
    const getSession = vi.fn(async (): Promise<AuthClientResult> => ({ data: null, error: { status: 503 } }));
    const delays = vi.fn(async (_ms: number) => {});

    await expect(checkSessionWithRetry(getSession, { retryDelaysMs: [10, 20], wait: delays })).resolves.toEqual({
      kind: 'unknown',
      status: 503,
    });
    expect(delays.mock.calls).toEqual([[10], [20]]);
  });

  it('gives up as unknown after its retries, including when the request throws', async () => {
    const getSession = vi.fn(async (): Promise<AuthClientResult> => {
      throw new TypeError('Failed to fetch');
    });

    await expect(checkSessionWithRetry(getSession, { retryDelaysMs: [10, 20], wait })).resolves.toEqual({ kind: 'unknown' });
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it('does not retry a confirmed signed-out answer', async () => {
    const getSession = vi.fn(async () => ({ data: null, error: null }));

    await expect(checkSessionWithRetry(getSession, { retryDelaysMs: [10, 20], wait })).resolves.toEqual({
      kind: 'unauthenticated',
    });
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe('resolveProtectedRouteAction', () => {
  it('sends only a confirmed signed-out visitor to /login', () => {
    expect(resolveProtectedRouteAction('unauthenticated')).toBe('redirect');
    expect(resolveProtectedRouteAction('unavailable')).toBe('unavailable');
    expect(resolveProtectedRouteAction('loading')).toBe('wait');
    expect(resolveProtectedRouteAction('authenticated')).toBe('render');
  });
});

describe('signUpRequiresEmailVerification', () => {
  it('follows the sign-up response, not a later session check', () => {
    expect(signUpRequiresEmailVerification({ token: null, user })).toBe(true);
    expect(signUpRequiresEmailVerification({ token: 'session-token', user })).toBe(false);
  });
});
