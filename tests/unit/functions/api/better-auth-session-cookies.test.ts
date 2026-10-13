import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTheAuthTables } from '../../../support/betterAuthInMemory';

import { LOCAL_AUTH_ORIGIN, postToBetterAuth } from '../../../support/betterAuth';
import { apiEnv, TEST_AUTH_SECRET } from '../../../support/apiEnv';

const env = apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET, AUTH_EMAIL_VERIFICATION_REQUIRED: 'false' });
const SESSION_COOKIE = /^(?:__Secure-)?better-auth\.session_token=/;

async function cookiesSetBySigningUpAndIn(origin: string) {
  const account = { email: `jane-on-${new URL(origin).protocol.replace(':', '')}@example.test`, password: 'jane-password-1' };
  const signUp = await postToBetterAuth(env, 'sign-up/email', { body: { ...account, name: 'Jane' }, origin });
  const signIn = await postToBetterAuth(env, 'sign-in/email', { body: account, origin });
  expect([signUp.status, signIn.status]).toEqual([200, 200]);
  return [...signUp.headers.getSetCookie(), ...signIn.headers.getSetCookie()];
}

describe("the session cookies of the app's Better Auth configuration, on an in-memory database", { timeout: 30_000 }, () => {
  beforeEach(() => {
    emptyTheAuthTables();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets every auth cookie of a sign-up and a sign-in httpOnly, locally and on https, so no page script can read the session', async () => {
    for (const origin of [LOCAL_AUTH_ORIGIN, 'https://app.example.test']) {
      const cookies = await cookiesSetBySigningUpAndIn(origin);

      expect(cookies.filter((cookie) => SESSION_COOKIE.test(cookie)), origin).toHaveLength(2);
      for (const cookie of cookies) expect(cookie, origin).toMatch(/;\s*HttpOnly(?:;|$)/i);
    }
  });
});
