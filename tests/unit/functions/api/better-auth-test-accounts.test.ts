import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_ACCOUNTS_DISABLED_MESSAGE } from '@functions/api/utils/test-email-block';
import { silenceLogs } from '../../../support/apiRouter';
import { SqliteD1 } from '../../../support/sqlite-d1';
import { LOCAL_AUTH_ORIGIN, postToBetterAuth } from '../../../support/betterAuth';
import { betterAuthErrorBody, readJson } from '../../../support/readJson';
import { apiEnv } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';

const PASSWORD = 'original-password-1';

describe('test accounts under the production auth policy, which Better Auth enforces on the ways in the router does not check', { timeout: 30_000 }, () => {
  let database: SqliteD1;
  let localEnv: Env;
  let productionEnv: Env;

  function authRequest(origin: string, path: string, body: unknown, env = productionEnv) {
    return postToBetterAuth(env, path, { body, origin });
  }

  async function createVerifiedAccount(email: string, username: string) {
    const signUp = await authRequest(
      LOCAL_AUTH_ORIGIN,
      'sign-up/email',
      { email, password: PASSWORD, name: 'Member', username },
      localEnv,
    );
    expect(signUp.status).toBe(200);
    database.sqlite.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email.toLowerCase());
  }

  beforeEach(() => {
    database = new SqliteD1();
    localEnv = apiEnv({
      DB: database.binding,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
    });
    productionEnv = { ...localEnv, AUTH_EMAIL_VERIFICATION_REQUIRED: 'true', RESEND_API_KEY: 're_test_123' };
    const breachedPasswordLookupFindingNothing = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', breachedPasswordLookupFindingNothing);
    silenceLogs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  it('refuses username sign-in to a test-domain account in production', async () => {
    await createVerifiedAccount('qa-bot@serplists.dev', 'qabot');

    const response = await authRequest('https://serplists.com', 'sign-in/username', {
      username: 'qabot',
      password: PASSWORD,
    });

    expect(response.status).toBe(403);
    expect((await readJson(response, betterAuthErrorBody)).message).toBe(TEST_ACCOUNTS_DISABLED_MESSAGE);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
    expect(database.sqlite.prepare('SELECT count(*) AS count FROM session').get()).toEqual({ count: 1 });
  });

  it('refuses email sign-in to a test-domain account in production even past the router', async () => {
    await createVerifiedAccount('QA-Bot@Serplists.dev', 'qabot');

    const response = await authRequest('https://serplists.com', 'sign-in/email', {
      email: 'qa-bot@serplists.dev',
      password: PASSWORD,
    });

    expect(response.status).toBe(403);
    expect((await readJson(response, betterAuthErrorBody)).message).toBe(TEST_ACCOUNTS_DISABLED_MESSAGE);
  });

  it('refuses a test-domain sign-up in production and stores nothing', async () => {
    const response = await authRequest('https://serplists.com', 'sign-up/email', {
      email: 'new@serp-checklists.dev',
      password: 'a-strong-unbreached-passphrase-81',
      name: 'Blocked',
    });

    expect(response.status).toBe(403);
    expect(database.sqlite.prepare('SELECT count(*) AS count FROM users').get()).toEqual({ count: 0 });
  });

  it('still signs in other accounts in production and test accounts locally', async () => {
    await createVerifiedAccount('member@example.com', 'member');
    await createVerifiedAccount('qa-bot@serplists.dev', 'qabot');

    const production = await authRequest('https://serplists.com', 'sign-in/username', {
      username: 'member',
      password: PASSWORD,
    });
    const local = await authRequest(
      LOCAL_AUTH_ORIGIN,
      'sign-in/username',
      { username: 'qabot', password: PASSWORD },
      localEnv,
    );

    expect(production.status).toBe(200);
    expect(local.status).toBe(200);
  });
});
