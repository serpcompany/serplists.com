import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiWorker from '@functions/api/[[route]].ts';
import { silenceLogs } from '../../../support/apiRouter';
import { SqliteD1 } from '../../../support/sqlite-d1';
import { wranglerEnvVars } from '../../../support/wranglerToml';
import { apiErrorBody, readJson } from '../../../support/readJson';
import { apiEnv } from '../../../support/apiEnv';
import { present } from '../../../support/elements';
import type { Env } from '@functions/api/types';

const STAGING_ORIGINS = ['https://staging.serplists.com', 'https://staging.serp-checklists.pages.dev'];
const PASSWORD = 'a-strong-unbreached-passphrase-81';

describe('auth policy per deployment, from its AUTH_EMAIL_VERIFICATION_REQUIRED and never the request host', { timeout: 30_000 }, () => {
  let database: SqliteD1;
  let breachedPasswordAndEmailProviderCalls: ReturnType<typeof vi.fn>;

  const previewEnv = () =>
    apiEnv({
      DB: database.binding,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: wranglerEnvVars('preview').AUTH_EMAIL_VERIFICATION_REQUIRED,
      CORS_ALLOWED_ORIGINS: wranglerEnvVars('preview').CORS_ALLOWED_ORIGINS,
    });

  const productionEnv = (overrides: Partial<Env> = {}) =>
    apiEnv({
      DB: database.binding,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: wranglerEnvVars('production').AUTH_EMAIL_VERIFICATION_REQUIRED,
      CORS_ALLOWED_ORIGINS: wranglerEnvVars('production').CORS_ALLOWED_ORIGINS,
      ...overrides,
    });

  function signUp(origin: string, env: Env, email: string) {
    return apiWorker.fetch(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ email, password: PASSWORD, name: 'Staging Tester' }),
      }),
      env,
    );
  }

  const userCount = () => {
    const { count } = present(database.sqlite.prepare('SELECT count(*) AS count FROM users').get(), 'the user count');
    return count;
  };

  beforeEach(() => {
    database = new SqliteD1();
    breachedPasswordAndEmailProviderCalls = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', breachedPasswordAndEmailProviderCalls);
    silenceLogs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    database.sqlite.close();
  });

  it.each(STAGING_ORIGINS)('signs up on %s with the preview policy and no email provider', async (origin) => {
    const response = await signUp(origin, previewEnv(), 'tester@example.com');

    expect(response.status).toBe(200);
    expect(userCount()).toBe(1);
  });

  it.each(STAGING_ORIGINS)('keeps production-only checks off on %s, signing up a test-domain account with no breached-password lookup', async (origin) => {
    const response = await signUp(origin, previewEnv(), 'qa-bot@serplists.dev');

    expect(response.status).toBe(200);
    expect(breachedPasswordAndEmailProviderCalls).not.toHaveBeenCalled();
  });

  it.each(['https://serplists.com', 'https://serp-checklists.pages.dev'])(
    'refuses sign-up on %s under the production policy when email cannot be sent',
    async (origin) => {
      const response = await signUp(origin, productionEnv(), 'new-user@example.com');

      expect(response.status).toBe(503);
      expect((await readJson(response, apiErrorBody)).code).toBe('auth_email_unavailable');
      expect(userCount()).toBe(0);
    },
  );

  it('blocks test-domain accounts under the production policy whatever the host', async () => {
    const response = await signUp(
      'https://serp-checklists.pages.dev',
      productionEnv({ RESEND_API_KEY: 're_test_123', CORS_ALLOWED_ORIGINS: 'https://serp-checklists.pages.dev' }),
      'qa-bot@serplists.dev',
    );

    expect(response.status).toBe(403);
    expect(userCount()).toBe(0);
  });

  it('reports the preview policy in auth status on staging.serplists.com', async () => {
    const response = await apiWorker.fetch(
      new Request('https://staging.serplists.com/api/auth/status'),
      previewEnv(),
    );

    expect(await response.json()).toEqual({
      accountRegistrationAvailable: true,
      emailAuthAvailable: false,
      emailVerificationRequired: false,
    });
  });
});
