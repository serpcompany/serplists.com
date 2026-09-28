import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the app's real Better Auth configuration (createBetterAuth) against an
// in-memory database instead of D1, so the reset flow below is Better Auth's own.
const memory = vi.hoisted(() => ({ db: {} as Record<string, any[]> }));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => memoryAdapter(memory.db),
}));

vi.mock('@functions/api/db', () => ({
  createDb: vi.fn(() => ({})),
  schema: {},
}));

import { createBetterAuth } from '@functions/api/better-auth';
import { getSessionUserId } from '@functions/api/utils/session';

const BASE_URL = 'http://localhost:8788';
const EMAIL = 'john@test.com';
const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
  RESEND_API_KEY: 're_test_123',
} as any;

function authRequest(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { Origin: BASE_URL };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.cookie) headers.Cookie = init.cookie;
  const request = new Request(`${BASE_URL}/api/auth/${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return createBetterAuth(env, request).handler(request);
}

function sessionCookieFrom(response: Response): string {
  const match = (response.headers.get('set-cookie') ?? '').match(/better-auth\.session_token=[^;]+/);
  if (!match) throw new Error('No session cookie');
  return match[0];
}

async function userIdFor(cookie: string) {
  return getSessionUserId(new Request(`${BASE_URL}/api/templates`, { headers: { Cookie: cookie } }), env);
}

describe('password reset', { timeout: 30_000 }, () => {
  let sentEmails: string[];

  beforeEach(() => {
    memory.db = { users: [], session: [], account: [], verification: [] };
    sentEmails = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentEmails.push(String(JSON.parse(String(init?.body)).text));
        return new Response('{}', { status: 200 });
      }),
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('signs out every existing session, including a hijacked one', async () => {
    const signUp = await authRequest('sign-up/email', {
      body: { email: EMAIL, password: 'original-password-1', name: 'John' },
    });
    expect(signUp.status).toBe(200);
    const victimCookie = sessionCookieFrom(signUp);

    const attackerSignIn = await authRequest('sign-in/email', {
      body: { email: EMAIL, password: 'original-password-1' },
    });
    expect(attackerSignIn.status).toBe(200);
    const attackerCookie = sessionCookieFrom(attackerSignIn);

    const userId = memory.db.users[0].id;
    expect(await userIdFor(victimCookie)).toBe(userId);
    expect(await userIdFor(attackerCookie)).toBe(userId);

    const requestReset = await authRequest('request-password-reset', {
      body: { email: EMAIL, redirectTo: `${BASE_URL}/reset-password` },
    });
    expect(requestReset.status).toBe(200);
    const token = sentEmails.at(-1)?.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();

    const reset = await authRequest('reset-password', {
      body: { newPassword: 'brand-new-password-2', token },
    });
    expect(reset.status).toBe(200);

    expect(await userIdFor(attackerCookie)).toBeNull();
    expect(await userIdFor(victimCookie)).toBeNull();
    expect(memory.db.session.filter((row) => row.userId === userId)).toEqual([]);

    const signInWithNewPassword = await authRequest('sign-in/email', {
      body: { email: EMAIL, password: 'brand-new-password-2' },
    });
    expect(signInWithNewPassword.status).toBe(200);
  });
});
