import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { emptyTheAuthTables, inMemoryAuth } from '../../../support/betterAuthInMemory';

import { getSessionUserId } from '@functions/api/utils/session';
import { captureTheEmailsSent, LOCAL_AUTH_ORIGIN, postToBetterAuth, sessionCookieFrom } from '../../../support/betterAuth';

const EMAIL = 'john@test.com';
const env = {
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
  RESEND_API_KEY: 're_test_123',
} as any;

async function userIdFor(cookie: string) {
  return getSessionUserId(new Request(`${LOCAL_AUTH_ORIGIN}/api/templates`, { headers: { Cookie: cookie } }), env);
}

describe('password reset through the app\'s Better Auth configuration on an in-memory database', { timeout: 30_000 }, () => {
  let sentEmails: string[];

  beforeEach(() => {
    emptyTheAuthTables();
    sentEmails = captureTheEmailsSent();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('signs out every existing session, including a hijacked one', async () => {
    const signUp = await postToBetterAuth(env, 'sign-up/email', {
      body: { email: EMAIL, password: 'original-password-1', name: 'John' },
    });
    expect(signUp.status).toBe(200);
    const victimCookie = sessionCookieFrom(signUp);

    const attackerSignIn = await postToBetterAuth(env, 'sign-in/email', {
      body: { email: EMAIL, password: 'original-password-1' },
    });
    expect(attackerSignIn.status).toBe(200);
    const attackerCookie = sessionCookieFrom(attackerSignIn);

    const userId = firstOf(inMemoryAuth.tables.users).id;
    expect(await userIdFor(victimCookie)).toBe(userId);
    expect(await userIdFor(attackerCookie)).toBe(userId);

    const requestReset = await postToBetterAuth(env, 'request-password-reset', {
      body: { email: EMAIL, redirectTo: `${LOCAL_AUTH_ORIGIN}/reset-password` },
    });
    expect(requestReset.status).toBe(200);
    const token = sentEmails.at(-1)?.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();

    const reset = await postToBetterAuth(env, 'reset-password', {
      body: { newPassword: 'brand-new-password-2', token },
    });
    expect(reset.status).toBe(200);

    expect(await userIdFor(attackerCookie)).toBeNull();
    expect(await userIdFor(victimCookie)).toBeNull();
    expect(inMemoryAuth.tables.session.filter((row) => row.userId === userId)).toEqual([]);

    const signInWithNewPassword = await postToBetterAuth(env, 'sign-in/email', {
      body: { email: EMAIL, password: 'brand-new-password-2' },
    });
    expect(signInWithNewPassword.status).toBe(200);
  });
});
