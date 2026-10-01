import { memoryAdapter } from 'better-auth/adapters/memory';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => ({ db: {} as Record<string, any[]> }));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => memoryAdapter(memory.db),
}));

vi.mock('@functions/api/db', () => ({
  createDb: vi.fn(() => ({})),
  schema: {},
}));

import { createBetterAuth } from '@functions/api/better-auth';
import { NEW_PASSWORD_BODY_FIELDS } from '@functions/api/utils/password-length';
import { LOCAL_AUTH_ORIGIN as BASE_URL, postToBetterAuth, sessionCookieFrom } from '../../../support/betterAuth';

const EMAIL = 'john@test.com';
const PASSWORD = 'original-password-1';
const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
  RESEND_API_KEY: 're_test_123',
} as any;

const ascii = (bytes: number) => 'a'.repeat(bytes);
const fourByteEmoji = (count: number) => '\u{1F600}'.repeat(count);

const authRequest = (path: string, init: { body?: unknown; cookie?: string } = {}) => postToBetterAuth(env, path, init);

function signUp(password: string, email = EMAIL) {
  return authRequest('sign-up/email', { body: { email, password, name: 'John' } });
}

function signIn(password: string, email = EMAIL) {
  return authRequest('sign-in/email', { body: { email, password } });
}

async function errorMessage(response: Response): Promise<string> {
  return String((await response.json()).message ?? '');
}

describe('password byte limit, since bcrypt uses only the first 72 UTF-8 bytes', { timeout: 30_000 }, () => {
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
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses a sign-up password longer than 72 bytes and creates no account', async () => {
    const shared = ascii(72);

    const response = await signUp(`${shared}-my-unique-suffix`);

    expect(response.status).toBe(400);
    expect(await errorMessage(response)).toMatch(/72/);
    expect(memory.db.users).toEqual([]);
    expect(await signIn(`${shared}-anything-else`).then((r) => r.status)).not.toBe(200);
  });

  it.each([
    ['no password', { email: EMAIL, name: 'John' }],
    ['a password that is not text', { email: EMAIL, password: 12345678901, name: 'John' }],
  ])('refuses a sign-up with %s and creates no account', async (_label, body) => {
    const response = await authRequest('sign-up/email', { body });

    expect(response.status).toBe(400);
    expect(await errorMessage(response)).toBe('Invalid password');
    expect(memory.db.users).toEqual([]);
  });

  it('refuses a change-password request without a newPassword and keeps the old password', async () => {
    const cookie = sessionCookieFrom(await signUp(PASSWORD));

    const response = await authRequest('change-password', { cookie, body: { currentPassword: PASSWORD } });

    expect(response.status).toBe(400);
    expect((await signIn(PASSWORD)).status).toBe(200);
  });

  it.each([
    ['73 ASCII characters', ascii(73), 400],
    ['19 emoji (38 characters, 76 bytes)', fourByteEmoji(19), 400],
    ['72 ASCII characters', ascii(72), 200],
    ['18 emoji (72 bytes)', fourByteEmoji(18), 200],
  ])('sign-up with %s', async (_label, password, status) => {
    const response = await signUp(password);

    expect(response.status).toBe(status);
    if (status === 200) expect((await signIn(password)).status).toBe(200);
  });

  it('refuses a change-password newPassword longer than 72 bytes and keeps the old password', async () => {
    const cookie = sessionCookieFrom(await signUp(PASSWORD));

    const response = await authRequest('change-password', {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: `${ascii(72)}b` },
    });

    expect(response.status).toBe(400);
    expect(await errorMessage(response)).toMatch(/72/);
    expect((await signIn(PASSWORD)).status).toBe(200);
  });

  it('refuses a reset newPassword longer than 72 bytes and leaves the token usable', async () => {
    await signUp(PASSWORD);
    await authRequest('request-password-reset', { body: { email: EMAIL, redirectTo: `${BASE_URL}/reset-password` } });
    const token = sentEmails.at(-1)?.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();

    const tooLong = await authRequest('reset-password', { body: { token, newPassword: `${ascii(40)}${fourByteEmoji(9)}` } });
    expect(tooLong.status).toBe(400);
    expect(await errorMessage(tooLong)).toMatch(/72/);

    const retry = await authRequest('reset-password', { body: { token, newPassword: 'brand-new-password-2' } });
    expect(retry.status).toBe(200);
  });

  it('answers a long sign-in password for an unknown email like a wrong password', async () => {
    await signUp(PASSWORD);

    const unknownEmail = await signIn(ascii(100), 'nobody@test.com');
    const wrongPassword = await signIn(ascii(100));

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(await errorMessage(unknownEmail)).toBe(await errorMessage(wrongPassword));
  });

  it('still signs in an existing account whose stored password is longer than 72 bytes', async () => {
    await signUp(PASSWORD);
    const legacyPassword = `${ascii(80)}-set-before-the-limit`;
    memory.db.account[0].password = await bcrypt.hash(legacyPassword, 4);

    expect((await signIn(legacyPassword)).status).toBe(200);
  });
});

const ENDPOINTS_THAT_ONLY_CHECK_A_PASSWORD_ALREADY_SET = ['/sign-in/email', '/sign-in/username', '/delete-user'];

describe('NEW_PASSWORD_BODY_FIELDS', () => {
  it('covers every configured Better Auth endpoint that takes a new password', () => {
    const request = new Request(`${BASE_URL}/api/auth/sign-up/email`, { method: 'POST' });
    const endpoints = Object.values(createBetterAuth(env, request).api) as Array<{
      path: string;
      options?: { body?: { shape?: Record<string, unknown> } };
    }>;

    const passwordFields = endpoints.flatMap((endpoint) =>
      Object.keys(endpoint.options?.body?.shape ?? {})
        .filter((field) => /password/i.test(field) && field !== 'currentPassword')
        .map((field) => ({ path: endpoint.path, field })),
    );
    expect(passwordFields.length).toBeGreaterThan(0);

    for (const { path, field } of passwordFields) {
      if (ENDPOINTS_THAT_ONLY_CHECK_A_PASSWORD_ALREADY_SET.includes(path)) continue;
      expect(NEW_PASSWORD_BODY_FIELDS[path], `${path} takes ${field}`).toBe(field);
    }
    expect(NEW_PASSWORD_BODY_FIELDS['/sign-up/email']).toBe('password');
    for (const path of ENDPOINTS_THAT_ONLY_CHECK_A_PASSWORD_ALREADY_SET) expect(NEW_PASSWORD_BODY_FIELDS[path]).toBeUndefined();
  });
});
