import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterAuth } from '@functions/api/better-auth';
import apiWorker from '@functions/api/[[route]]';
import { SqliteD1 } from '../../../support/sqlite-d1';

const BASE_URL = 'http://localhost:8788';
const EMAIL = 'victim@example.com';
const FORGED_HOST = 'evil.example';
const FORGED_HEADERS = { 'X-Forwarded-Host': FORGED_HOST, 'X-Forwarded-Proto': 'https' };

describe('Better Auth base URL, from the host the request reached and never the forwarded headers a client can send', { timeout: 30_000 }, () => {
  let database: SqliteD1;
  let env: any;
  let sentEmails: string[];

  function authPost(path: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`${BASE_URL}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  async function signUp() {
    const response = await apiWorker.fetch(
      authPost('sign-up/email', { email: EMAIL, password: 'original-password-1', name: 'Victim' }, { Origin: BASE_URL }),
      env,
    );
    expect(response.status).toBe(200);
  }

  function clearTheBaseUrlsBetterAuthWouldReadFromNodesProcessEnv() {
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_URL', '');
    vi.stubEnv('BASE_URL', '');
  }

  beforeEach(() => {
    clearTheBaseUrlsBetterAuthWouldReadFromNodesProcessEnv();
    database = new SqliteD1();
    env = {
      DB: database.binding,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
      RESEND_API_KEY: 're_test_123',
    };
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  it.each([
    ['without an Origin header', FORGED_HEADERS],
    ['with a trusted Origin header', { ...FORGED_HEADERS, Origin: BASE_URL }],
  ])('builds the password reset link from the request host %s', async (_label, headers) => {
    await signUp();

    const response = await apiWorker.fetch(
      authPost('request-password-reset', { email: EMAIL, redirectTo: `${BASE_URL}/reset-password` }, headers),
      env,
    );

    expect(response.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toContain(`${BASE_URL}/api/auth/reset-password/`);
    expect(sentEmails[0]).not.toContain(FORGED_HOST);
  });

  it('builds the verification link from the request host', async () => {
    await signUp();

    const response = await apiWorker.fetch(
      authPost('send-verification-email', { email: EMAIL, callbackURL: `${BASE_URL}/dashboard` }, FORGED_HEADERS),
      env,
    );

    expect(response.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toContain(`${BASE_URL}/api/auth/verify-email?token=`);
    expect(sentEmails[0]).not.toContain(FORGED_HOST);
  });

  it('does not trust a redirect to the forwarded host', async () => {
    await signUp();

    const response = await apiWorker.fetch(
      authPost('request-password-reset', { email: EMAIL, redirectTo: `https://${FORGED_HOST}/steal` }, FORGED_HEADERS),
      env,
    );

    expect(response.status).toBe(403);
    expect(sentEmails).toEqual([]);
  });

  it('pins the base URL to the request origin', async () => {
    const request = new Request(`${BASE_URL}/api/auth/get-session`, { headers: FORGED_HEADERS });

    const context = await createBetterAuth(env, request).$context;

    expect(context.options.baseURL).toBe(BASE_URL);
    expect(context.baseURL).toBe(`${BASE_URL}/api/auth`);
  });
});
