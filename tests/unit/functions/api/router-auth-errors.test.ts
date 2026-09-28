import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Errors the router sends for /api/auth/* itself, before Better Auth runs. The
// Better Auth client hands the UI the parsed body, and the UI reads `message`
// (Better Auth's own shape), so every such body must carry one.
const HOST = 'https://app.example.test';
const BETTER_AUTH_MODULE = '../../../../functions/api/better-auth';
let ipCounter = 0;

function buildEnv(overrides: Record<string, unknown> = {}) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    FRONTEND_URL: HOST,
    RESEND_API_KEY: 're_test_key',
    ...overrides,
  } as any;
}

function authPost(path: string, init: { body?: string; headers?: Record<string, string>; ip?: string } = {}) {
  return new Request(`${HOST}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: HOST,
      ...(init.ip ? { 'CF-Connecting-IP': init.ip } : {}),
      ...init.headers,
    },
    body: init.body ?? JSON.stringify({ email: 'person@example.com', password: 'a-long-password-1' }),
  });
}

describe('router-generated auth errors', { timeout: 30_000 }, () => {
  const betterAuthHandler = vi.fn(async () => Response.json({ ok: true }));

  async function send(request: Request, env = buildEnv()) {
    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    return apiWorker.fetch(request, env);
  }

  async function expectAuthErrorBody(response: Response, status: number, code?: string) {
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(typeof body.message).toBe('string');
    expect(body.message.trim()).not.toBe('');
    // Existing API readers use `error`.
    expect(body.error).toBe(body.message);
    if (code) expect(body.code).toBe(code);
    return body;
  }

  beforeEach(() => {
    ipCounter += 1;
    betterAuthHandler.mockReset().mockImplementation(async () => Response.json({ ok: true }));
    vi.doMock(BETTER_AUTH_MODULE, () => ({ createBetterAuth: vi.fn(() => ({ handler: betterAuthHandler })) }));
    for (const level of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
  });

  afterEach(() => {
    vi.doUnmock(BETTER_AUTH_MODULE);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sends a readable 429 with the wait in the body and an exposed Retry-After', async () => {
    const ip = `198.51.100.${ipCounter}`;
    for (let index = 0; index < 30; index += 1) {
      expect((await send(authPost('auth/sign-in/email', { ip }))).status).toBe(200);
    }

    const response = await send(authPost('auth/sign-in/email', { ip }));

    const body = await expectAuthErrorBody(response, 429, 'rate_limited');
    const retryAfter = Number(response.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBe(retryAfter);
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
  });

  it('sends a readable 403 for a blocked test account', async () => {
    const response = await send(
      authPost('auth/sign-up/email', {
        body: JSON.stringify({ email: 'qa@serplists.dev', password: 'a-long-password-1', name: 'QA' }),
      }),
      buildEnv({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'true' }),
    );

    const body = await expectAuthErrorBody(response, 403, 'test_account_blocked');
    expect(body.message).toBe('Test accounts are disabled in production');
    expect(betterAuthHandler).not.toHaveBeenCalled();
  });

  it('sends a readable 503 when auth email cannot be sent', async () => {
    const response = await send(
      authPost('auth/request-password-reset', { body: JSON.stringify({ email: 'person@example.com' }) }),
      buildEnv({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'true', RESEND_API_KEY: undefined }),
    );

    await expectAuthErrorBody(response, 503, 'auth_email_unavailable');
    expect(betterAuthHandler).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-JSON body', { headers: { 'Content-Type': 'text/plain' } }, 415],
    ['an untrusted Origin', { headers: { Origin: 'https://evil.example' } }, 403],
    ['an oversized body', { body: JSON.stringify({ email: 'x'.repeat(20 * 1024) }) }, 413],
  ])('sends a readable error for %s', async (_label, init, status) => {
    const response = await send(authPost('auth/sign-in/email', init));

    await expectAuthErrorBody(response, status);
    expect(betterAuthHandler).not.toHaveBeenCalled();
  });

  it('sends a readable 500 when the API configuration is invalid', async () => {
    const response = await send(authPost('auth/sign-in/email'), buildEnv({ FRONTEND_URL: 'not a url' }));

    await expectAuthErrorBody(response, 500);
  });

  it('sends a readable 500 when Better Auth throws', async () => {
    betterAuthHandler.mockRejectedValueOnce(new Error('boom'));

    const response = await send(authPost('auth/sign-in/email'));

    const body = await expectAuthErrorBody(response, 500);
    expect(JSON.stringify(body)).not.toContain('boom');
  });

  it('keeps the plain { error } shape for other API routes', async () => {
    const response = await send(
      new Request(`${HOST}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(2 * 1024 * 1024) }),
      }),
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toMatch(/Payload too large/);
    expect(body).not.toHaveProperty('message');
  });
});
