import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';
import { answeringPwnedPasswords } from '../../../fixtures/pwnedPasswords';
import { postToBetterAuth } from '../../../support/betterAuth';

const EMAIL = 'new-user@example.com';
const START = Date.parse('2026-01-01T00:00:00Z');

describe('sign-up when the verification email cannot be sent, through the app\'s Better Auth on the migrated tables with only the email provider faked', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let env: any;
  let emailProvider: ReturnType<typeof vi.fn>;
  let logged: string[];

  const signUp = () => postToBetterAuth(env, 'sign-up/email', { body: { email: EMAIL, password: 'original-password-1', name: 'New User' } });

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
    emailProvider = vi.fn(async () => new Response(`rate limited for ${EMAIL}`, { status: 429 }));
    vi.stubGlobal('fetch', answeringPwnedPasswords(emailProvider));
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
    emailProvider.mockImplementation(async () => reply());

    const response = await signUp();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: null, user: { email: EMAIL, emailVerified: false } });
    expect(database.sqlite.prepare('SELECT email, email_verified FROM users').all()).toEqual([
      { email: EMAIL, email_verified: 0 },
    ]);
    expect(emailProvider).toHaveBeenCalledTimes(1);
    expect(logged.some((line) => line.includes('auth_email_send_failed'))).toBe(true);
    expect(logged.join('\n')).not.toContain(EMAIL);
  });

  it('lets the new user resend the verification email right away', async () => {
    expect((await signUp()).status).toBe(200);
    emailProvider.mockImplementation(async () => new Response('{}', { status: 200 }));

    vi.setSystemTime(START + 5_000);
    const resend = await postToBetterAuth(env, 'send-verification-email', { body: { email: EMAIL } });

    expect(resend.status).toBe(200);
    expect(emailProvider).toHaveBeenCalledTimes(2);
  });

  it('still fails an explicit resend when the provider is down', async () => {
    emailProvider.mockImplementation(async () => new Response('{}', { status: 200 }));
    expect((await signUp()).status).toBe(200);
    emailProvider.mockImplementation(async () => new Response('provider outage', { status: 503 }));

    vi.setSystemTime(START + 120_000);
    const resend = await postToBetterAuth(env, 'send-verification-email', { body: { email: EMAIL } });

    expect(resend.status).toBeGreaterThanOrEqual(500);
  });
});
