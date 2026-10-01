import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '@functions/api/db';
import {
  claimAuthEmailSend,
  shouldSendAuthEmail,
  type AuthEmailKind,
} from '@functions/api/utils/auth-email-throttle';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';
import { answeringPwnedPasswords } from '../../../fixtures/pwnedPasswords';
import { LOCAL_AUTH_ORIGIN as BASE_URL, postToBetterAuth } from '../../../support/betterAuth';

const START = Date.parse('2026-01-01T00:00:00Z');
const SECOND = 1000;

type SentEmail = { to: string; subject: string };

describe('auth email throttle, through the real Better Auth configuration on the migrated tables', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let env: any;
  let sent: SentEmail[];

  function authRequest(path: string, body: unknown) {
    return postToBetterAuth(env, path, { body });
  }

  function at(offsetMs: number) {
    vi.setSystemTime(START + offsetMs);
  }

  async function signUp(email: string, { verified = true } = {}) {
    const response = await authRequest('sign-up/email', { email, password: 'original-password-1', name: 'Member' });
    expect(response.status).toBe(200);
    if (verified) {
      database.sqlite.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email);
    }
    sent = [];
  }

  function requestReset(email: string) {
    return authRequest('request-password-reset', { email, redirectTo: `${BASE_URL}/reset-password` });
  }

  function resetRows() {
    return database.sqlite
      .prepare("SELECT id FROM verification WHERE identifier LIKE 'reset-password:%'")
      .all();
  }

  function sentTo(email: string, subject: string) {
    return sent.filter((message) => message.to === email && message.subject === subject).length;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    database = createMigratedD1();
    env = {
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
      RESEND_API_KEY: 're_test_123',
    };
    sent = [];
    vi.stubGlobal(
      'fetch',
      answeringPwnedPasswords(async (_url: string, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body));
        sent.push({ to: payload.to, subject: payload.subject });
        return new Response('{}', { status: 200 });
      }),
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  it('sends one reset email a minute and keeps no token for a skipped one', async () => {
    await signUp('victim@example.com');

    const first = await requestReset('victim@example.com');
    at(10 * SECOND);
    const second = await requestReset('VICTIM@example.com');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(sentTo('victim@example.com', 'Reset your password')).toBe(1);
    expect(resetRows()).toHaveLength(1);

    at(61 * SECOND);
    expect((await requestReset('victim@example.com')).status).toBe(200);
    expect(sentTo('victim@example.com', 'Reset your password')).toBe(2);
  });

  it('sends at most five reset emails an hour, then allows more in the next hour', async () => {
    await signUp('victim@example.com');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      at(attempt * 61 * SECOND);
      expect((await requestReset('victim@example.com')).status).toBe(200);
    }
    expect(sentTo('victim@example.com', 'Reset your password')).toBe(5);
    expect(resetRows()).toHaveLength(5);

    at(3601 * SECOND);
    await requestReset('victim@example.com');
    expect(sentTo('victim@example.com', 'Reset your password')).toBe(6);
  });

  it('throttles each address and each kind of email separately', async () => {
    await signUp('victim@example.com');
    await signUp('other@example.com');
    await signUp('unverified@example.com', { verified: false });

    at(1000 * SECOND);
    await requestReset('victim@example.com');
    await requestReset('other@example.com');
    await requestReset('unverified@example.com');
    await authRequest('send-verification-email', { email: 'unverified@example.com' });

    expect(sentTo('victim@example.com', 'Reset your password')).toBe(1);
    expect(sentTo('other@example.com', 'Reset your password')).toBe(1);
    expect(sentTo('unverified@example.com', 'Reset your password')).toBe(1);
    expect(sentTo('unverified@example.com', 'Verify your email')).toBe(1);
  });

  it('skips a verification resend within a minute of the sign-up email', async () => {
    const signUpResponse = await authRequest('sign-up/email', {
      email: 'new@example.com',
      password: 'original-password-1',
      name: 'New',
    });
    expect(signUpResponse.status).toBe(200);
    at(20 * SECOND);
    const resend = await authRequest('send-verification-email', { email: 'new@example.com' });

    expect(resend.status).toBe(200);
    expect(sentTo('new@example.com', 'Verify your email')).toBe(1);

    at(81 * SECOND);
    await authRequest('send-verification-email', { email: 'new@example.com' });
    expect(sentTo('new@example.com', 'Verify your email')).toBe(2);
  });

  it('never sends a verification email to an address that is already verified', async () => {
    await signUp('victim@example.com');
    at(1000 * SECOND);

    const response = await authRequest('send-verification-email', { email: 'victim@example.com' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(sent).toEqual([]);
  });
});

describe('claimAuthEmailSend', () => {
  let database: ReturnType<typeof createMigratedD1>;

  beforeEach(() => {
    database = createMigratedD1();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  const claim = (userId: string, now: number, kind: AuthEmailKind = 'password-reset') =>
    claimAuthEmailSend(createDb({ DB: database.d1 } as any), { kind, userId, now });

  it('lets exactly one of two concurrent requests claim a send', async () => {
    const results = await Promise.all([claim('user-1', START), claim('user-1', START)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('allows five sends a minute apart per hour, then starts a new window', async () => {
    const results = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await claim('user-1', START + attempt * 61 * SECOND));
    }
    expect(results).toEqual([true, true, true, true, true, false]);

    expect(await claim('user-1', START + 3600 * SECOND)).toBe(true);
    expect(await claim('user-1', START + 3630 * SECOND)).toBe(false);
    expect(await claim('user-1', START + 3661 * SECOND)).toBe(true);
  });

  it('stores only the account id, never the email address', async () => {
    await claim('user-1', START, 'email-verification');

    expect(database.sqlite.prepare('SELECT id, identifier, value FROM verification').all()).toEqual([
      {
        id: 'auth-email-throttle:email-verification:user-1',
        identifier: 'auth-email-throttle:email-verification:user-1',
        value: '1',
      },
    ]);
  });

  it('sends anyway when D1 cannot record the send', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = { prepare: () => { throw new Error('D1_ERROR: database unavailable'); } };

    await expect(shouldSendAuthEmail({ DB: failing } as any, 'password-reset', 'user-1')).resolves.toBe(true);
  });
});
