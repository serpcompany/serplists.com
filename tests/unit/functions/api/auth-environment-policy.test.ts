import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiWorker from '@functions/api/[[route]].ts';
import { createMigratedD1 } from '../../../fixtures/sqliteD1';

// The auth policy comes from AUTH_EMAIL_VERIFICATION_REQUIRED in wrangler.toml
// ("false" on local and preview, "true" on production), never from the request
// hostname: preview aliases and custom staging domains such as
// staging.serplists.com must behave like staging.serp-checklists.pages.dev.
// Runs the real router and Better Auth against a migrated SQLite database.
const STAGING_ORIGINS = ['https://staging.serplists.com', 'https://staging.serp-checklists.pages.dev'];
const PASSWORD = 'a-strong-unbreached-passphrase-81';

describe('auth policy per deployment', { timeout: 30_000 }, () => {
  let database: ReturnType<typeof createMigratedD1>;
  let outbound: ReturnType<typeof vi.fn>;

  const previewEnv = () =>
    ({
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
      CORS_ALLOWED_ORIGINS: STAGING_ORIGINS.join(','),
    }) as any;

  const productionEnv = (overrides: Record<string, unknown> = {}) =>
    ({
      DB: database.d1,
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
      CORS_ALLOWED_ORIGINS: 'https://serplists.com',
      ...overrides,
    }) as any;

  function signUp(origin: string, env: unknown, email: string) {
    return apiWorker.fetch(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ email, password: PASSWORD, name: 'Staging Tester' }),
      }),
      env as any,
    );
  }

  const userCount = () => (database.sqlite.prepare('SELECT count(*) AS count FROM users').get() as { count: number }).count;

  beforeEach(() => {
    database = createMigratedD1();
    // Breached-password (Have I Been Pwned) and email provider calls.
    outbound = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', outbound);
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
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

  it.each(STAGING_ORIGINS)('keeps production-only checks off on %s', async (origin) => {
    const response = await signUp(origin, previewEnv(), 'qa-bot@serplists.dev');

    // Test-domain accounts are allowed and no breached-password lookup is made.
    expect(response.status).toBe(200);
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each(['https://serplists.com', 'https://serp-checklists.pages.dev'])(
    'refuses sign-up on %s under the production policy when email cannot be sent',
    async (origin) => {
      const response = await signUp(origin, productionEnv(), 'new-user@example.com');

      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe('auth_email_unavailable');
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
