import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterAuth } from '@functions/api/better-auth';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

// Runs the app's real Better Auth configuration and Drizzle adapter against a
// migrated SQLite database; only the email provider (fetch) is faked.
const BASE_URL = 'http://localhost:8788';
const EMAIL = 'new-user@example.com';
const START = Date.parse('2026-01-01T00:00:00Z');

describe('sign-up when the verification email cannot be sent', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let env: any;
  let provider: ReturnType<typeof vi.fn>;
  let logged: string[];

  function authRequest(path: string, body: unknown) {
    const request = new Request(`${BASE_URL}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify(body),
    });
    return createBetterAuth(env, request).handler(request);
  }

  const signUp = () => authRequest('sign-up/email', { email: EMAIL, password: 'original-password-1', name: 'New User' });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    database = createMigratedD1();
    env = {
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
      RESEND_API_KEY: 're_test_123',
    };
    provider = vi.fn(async () => new Response(`rate limited for ${EMAIL}`, { status: 429 }));
    vi.stubGlobal('fetch', provider);
    logged = [];
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  it.each([
    ['rejects the request (429)', () => new Response(`rate limited for ${EMAIL}`, { status: 429 })],
    ['fails (500)', () => new Response('provider outage', { status: 500 })],
    [
      'cannot be reached',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('reports the new account as created when the provider %s', async (_label, reply) => {
    provider.mockImplementation(async () => reply());

    const response = await signUp();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null, user: { email: EMAIL, emailVerified: false } });
    expect(database.sqlite.prepare('SELECT email, email_verified FROM users').all()).toEqual([
      { email: EMAIL, email_verified: 0 },
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(logged.some((line) => line.includes('auth_email_send_failed'))).toBe(true);
    expect(logged.join('\n')).not.toContain(EMAIL);
  });

  it('lets the new user resend the verification email right away', async () => {
    expect((await signUp()).status).toBe(200);
    provider.mockImplementation(async () => new Response('{}', { status: 200 }));

    vi.setSystemTime(START + 5_000);
    const resend = await authRequest('send-verification-email', { email: EMAIL });

    expect(resend.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('still fails an explicit resend when the provider is down', async () => {
    provider.mockImplementation(async () => new Response('{}', { status: 200 }));
    expect((await signUp()).status).toBe(200);
    provider.mockImplementation(async () => new Response('provider outage', { status: 503 }));

    vi.setSystemTime(START + 120_000);
    const resend = await authRequest('send-verification-email', { email: EMAIL });

    expect(resend.status).toBeGreaterThanOrEqual(500);
  });
});
