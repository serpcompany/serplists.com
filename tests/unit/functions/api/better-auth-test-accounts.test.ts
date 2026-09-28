import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterAuth } from '@functions/api/better-auth';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

// Runs the app's real Better Auth configuration and Drizzle adapter against a
// migrated SQLite database. The router blocks test emails only on the routes
// whose body carries an email, so Better Auth must enforce it for every other
// way in (username sign-in, direct handler calls).
const PASSWORD = 'original-password-1';

describe('test accounts on production hosts', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let env: any;

  function authRequest(origin: string, path: string, body: unknown) {
    const request = new Request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    });
    return createBetterAuth(env, request).handler(request);
  }

  async function createLocalAccount(email: string, username: string) {
    const signUp = await authRequest('http://localhost:8788', 'sign-up/email', {
      email,
      password: PASSWORD,
      name: 'Member',
      username,
    });
    expect(signUp.status).toBe(200);
  }

  beforeEach(() => {
    database = createMigratedD1();
    env = {
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
    };
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
    await createLocalAccount('qa-bot@serplists.dev', 'qabot');

    const response = await authRequest('https://serplists.com', 'sign-in/username', {
      username: 'qabot',
      password: PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie') ?? '').not.toContain('session_token=');
    expect(database.sqlite.prepare('SELECT count(*) AS count FROM session').get()).toEqual({ count: 1 });
  });

  it('refuses email sign-in to a test-domain account in production even past the router', async () => {
    await createLocalAccount('QA-Bot@Serplists.dev', 'qabot');

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
    await createLocalAccount('member@example.com', 'member');
    await createLocalAccount('qa-bot@serplists.dev', 'qabot');

    const production = await authRequest('https://serplists.com', 'sign-in/username', {
      username: 'member',
      password: PASSWORD,
    });
    const local = await authRequest('http://localhost:8788', 'sign-in/username', {
      username: 'qabot',
      password: PASSWORD,
    });

    expect(production.status).toBe(200);
    expect(local.status).toBe(200);
  });
});
