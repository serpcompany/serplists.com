import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { sessionCookieFrom } from '../../../support/betterAuth';

const BASE_URL = 'http://localhost:8788';
const DAY_MS = 24 * 60 * 60 * 1000;
const env = { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;

function realBetterAuthWithDefaultSessionsOnAnInMemoryDatabase() {
  const db: { user: any[]; session: any[]; account: any[]; verification: any[] } = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: BASE_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
  });
  return { auth, db };
}

async function loadSessionHelper(auth: unknown) {
  vi.doMock('../../../../functions/api/better-auth', () => ({
    createBetterAuth: vi.fn(() => auth),
  }));
  return import('../../../../functions/api/utils/session');
}

describe('getSessionUserId', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.doUnmock('../../../../functions/api/better-auth');
    vi.resetModules();
  });

  it('does not extend a session it cannot send a new cookie for, leaving the refresh to get-session', async () => {
    const { auth, db } = realBetterAuthWithDefaultSessionsOnAnInMemoryDatabase();
    const signUp = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
        body: JSON.stringify({ email: 'john@test.com', password: 'password123456', name: 'John' }),
      }),
    );
    expect(signUp.status).toBe(200);
    const cookie = sessionCookieFrom(signUp);

    const expiryDueForItsDailyRefresh = new Date(Date.now() + 5 * DAY_MS);
    const twoDaysAfterSignIn = new Date(Date.now() - 2 * DAY_MS);
    firstOf(db.session).expiresAt = expiryDueForItsDailyRefresh;
    firstOf(db.session).updatedAt = twoDaysAfterSignIn;

    const { getSessionUserId } = await loadSessionHelper(auth);
    const userId = await getSessionUserId(
      new Request(`${BASE_URL}/api/templates?scope=mine`, { headers: { Cookie: cookie } }),
      env,
    );

    expect(userId).toBe(firstOf(db.user).id);
    expect(new Date(firstOf(db.session).expiresAt).getTime()).toBe(expiryDueForItsDailyRefresh.getTime());

    const sessionCheck = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, { headers: { Cookie: cookie } }),
    );
    expect(sessionCheck.status).toBe(200);
    const refreshedCookie = sessionCheck.headers.get('set-cookie') ?? '';
    expect(refreshedCookie).toContain('better-auth.session_token=');
    const maxAge = Number(refreshedCookie.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
    expect(new Date(firstOf(db.session).expiresAt).getTime()).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
  });

  it('asks Better Auth for a read-only lookup and returns null when there is no session', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: 'user-1' } })
      .mockResolvedValueOnce(null);
    const { getSessionUserId } = await loadSessionHelper({ api: { getSession } });
    const request = new Request(`${BASE_URL}/api/templates`);

    await expect(getSessionUserId(request, env)).resolves.toBe('user-1');
    await expect(getSessionUserId(request, env)).resolves.toBeNull();
    for (const [options] of getSession.mock.calls) {
      expect(options.query).toEqual({ disableRefresh: true });
    }
  });

  it('rethrows and logs a failed lookup instead of treating the user as signed out', async () => {
    const errorLines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errorLines.push(String(line));
    });
    const lookupError = new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to get session' });
    const getSession = vi.fn().mockRejectedValue(lookupError);
    const { getSessionUserId } = await loadSessionHelper({ api: { getSession } });
    const request = new Request(`${BASE_URL}/api/templates`, {
      headers: { Cookie: 'better-auth.session_token=SECRET.SIGNATURE', 'X-Request-Id': 'req-1' },
    });

    await expect(getSessionUserId(request, env)).rejects.toBe(lookupError);

    expect(errorLines).toHaveLength(1);
    expect(JSON.parse(firstOf(errorLines))).toMatchObject({
      level: 'error',
      message: 'session_lookup_failed',
      requestId: 'req-1',
      errorName: 'APIError',
      status: 'INTERNAL_SERVER_ERROR',
    });
    expect(errorLines[0]).not.toContain('SECRET');
    vi.restoreAllMocks();
  });

  it('rethrows and logs when Better Auth cannot be set up', async () => {
    const errorLines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errorLines.push(String(line));
    });
    vi.doMock('../../../../functions/api/better-auth', () => ({
      createBetterAuth: vi.fn(() => {
        throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
      }),
    }));
    const { getSessionUserId } = await import('../../../../functions/api/utils/session');

    await expect(getSessionUserId(new Request(`${BASE_URL}/api/teams`), env)).rejects.toThrow('BETTER_AUTH_SECRET');
    expect(JSON.parse(firstOf(errorLines))).toMatchObject({ message: 'session_lookup_failed', errorName: 'Error' });
    vi.restoreAllMocks();
  });
});
