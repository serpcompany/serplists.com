import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { APIError } from 'better-auth/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_URL = 'http://localhost:8788';
const DAY_MS = 24 * 60 * 60 * 1000;
const env = { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;

// A real Better Auth instance (default 7-day sessions, refreshed after 1 day)
// backed by an in-memory database, so the test exercises the actual refresh logic.
function createMemoryAuth() {
  const db: Record<string, any[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: BASE_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
  });
  return { auth, db };
}

function sessionCookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/better-auth\.session_token=[^;]+/);
  if (!match) throw new Error(`No session cookie in: ${setCookie}`);
  return match[0];
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

  it('does not extend a session it cannot send a new cookie for', async () => {
    const { auth, db } = createMemoryAuth();
    const signUp = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
        body: JSON.stringify({ email: 'john@test.com', password: 'password123456', name: 'John' }),
      }),
    );
    expect(signUp.status).toBe(200);
    const cookie = sessionCookieFrom(signUp);

    // Two days after sign-in: the session is due for its daily refresh.
    const dueExpiry = new Date(Date.now() + 5 * DAY_MS);
    db.session[0].expiresAt = dueExpiry;
    db.session[0].updatedAt = new Date(Date.now() - 2 * DAY_MS);

    const { getSessionUserId } = await loadSessionHelper(auth);
    const userId = await getSessionUserId(
      new Request(`${BASE_URL}/api/templates?scope=mine`, { headers: { Cookie: cookie } }),
      env,
    );

    expect(userId).toBe(db.user[0].id);
    // Handler lookups must leave the refresh to GET /api/auth/get-session,
    // the only route whose Set-Cookie reaches the browser.
    expect(new Date(db.session[0].expiresAt).getTime()).toBe(dueExpiry.getTime());

    const sessionCheck = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, { headers: { Cookie: cookie } }),
    );
    expect(sessionCheck.status).toBe(200);
    const refreshedCookie = sessionCheck.headers.get('set-cookie') ?? '';
    expect(refreshedCookie).toContain('better-auth.session_token=');
    const maxAge = Number(refreshedCookie.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
    expect(new Date(db.session[0].expiresAt).getTime()).toBeGreaterThan(Date.now() + 6.9 * DAY_MS);
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

  // A failed lookup is an outage, not a signed-out user: answering 401 would
  // send a signed-in user to the sign-in page and hide the failure in the logs.
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
    expect(JSON.parse(errorLines[0])).toMatchObject({
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
    expect(JSON.parse(errorLines[0])).toMatchObject({ message: 'session_lookup_failed', errorName: 'Error' });
    vi.restoreAllMocks();
  });
});

describe('server-side session lookups', () => {
  const functionsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../functions');

  function listTsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return listTsFiles(full);
      return full.endsWith('.ts') ? [full] : [];
    });
  }

  it('never refresh a session outside the auth route', () => {
    const offenders: string[] = [];
    let lookups = 0;
    for (const file of listTsFiles(functionsDir)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\.api\.getSession\(/g)) {
        lookups += 1;
        const callEnd = source.indexOf('})', match.index);
        const call = source.slice(match.index, callEnd === -1 ? undefined : callEnd);
        if (!/disableRefresh:\s*true/.test(call)) {
          offenders.push(path.relative(functionsDir, file));
        }
      }
    }

    expect(lookups).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
