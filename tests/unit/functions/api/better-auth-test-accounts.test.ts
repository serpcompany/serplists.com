import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterAuth } from '@functions/api/better-auth';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

// Runs the app's real Better Auth configuration and Drizzle adapter against a
// migrated SQLite database. The router blocks test emails only on the routes
// whose body carries an email, so Better Auth must enforce it for every other
// way in (username sign-in, direct handler calls). The production policy comes
// from AUTH_EMAIL_VERIFICATION_REQUIRED, never the hostname.
const PASSWORD = 'original-password-1';

describe('test accounts under the production auth policy', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let localEnv: any;
  let productionEnv: any;

  function authRequest(origin: string, path: string, body: unknown, env = productionEnv) {
    const request = new Request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    });
    return createBetterAuth(env, request).handler(request);
  }

  // Created locally, then verified so production sign-in reaches the test-account check.
  async function createVerifiedAccount(email: string, username: string) {
    const signUp = await authRequest(
      'http://localhost:8788',
      'sign-up/email',
      { email, password: PASSWORD, name: 'Member', username },
      localEnv,
    );
    expect(signUp.status).toBe(200);
    database.sqlite.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email.toLowerCase());
  }

  beforeEach(() => {
    database = createMigratedD1();
    localEnv = {
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
    };
    productionEnv = { ...localEnv, AUTH_EMAIL_VERIFICATION_REQUIRED: 'true', RESEND_API_KEY: 're_test_123' };
    // Production sign-up checks the password against Have I Been Pwned; answer
    // "not found" instead of calling the real range API.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
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
      'http://localhost:8788',
      'sign-in/username',
      { username: 'qabot', password: PASSWORD },
      localEnv,
    );

    expect(production.status).toBe(200);
    expect(local.status).toBe(200);
  });
});
