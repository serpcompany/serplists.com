import { describe, it, expect } from 'vitest';
import apiWorker from '../../functions/api/[[route]].ts';

function buildEnv(overrides?: Record<string, unknown>) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  } as any;
}

describe('API Worker (no-wrangler integration)', () => {
  it('GET /api/health returns ok with CORS + request id', async () => {
    const response = await apiWorker.fetch(new Request('http://localhost/api/health'), buildEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  it('GET /api/health works with legacy JWT_SECRET when BETTER_AUTH_SECRET is missing', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/health'),
      buildEnv({
        BETTER_AUTH_SECRET: undefined,
        JWT_SECRET: 'legacy-fallback-secret-32-chars-minimum!!',
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  it('GET /api/health fails closed when FRONTEND_URL is malformed', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/health'),
      buildEnv({ FRONTEND_URL: 'serplists.com' })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Server configuration error');
  });

  it('GET /api/health fails closed when R2_PUBLIC_BASE_URL is malformed', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/health'),
      buildEnv({ R2_PUBLIC_BASE_URL: 'serplists.com' })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Server configuration error');
  });

  it('OPTIONS preflight returns CORS headers', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/auth/login', { method: 'OPTIONS' }),
      buildEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects oversized JSON bodies before routing', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(1024 * 1024 + 1),
        },
        body: '{}',
      }),
      buildEnv()
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('blocks test emails for production sign-up endpoint', async () => {
    const response = await apiWorker.fetch(
      new Request("https://serplists.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test-user@serplists.dev",
          password: "password123456",
          name: "Blocked User",
        }),
      }),
      buildEnv()
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Test accounts are disabled in production");
  });

  it('blocks test emails for production sign-in endpoint', async () => {
    const response = await apiWorker.fetch(
      new Request("https://serplists.com/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test-user@serplists.dev",
          password: "password123456",
        }),
      }),
      buildEnv()
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Test accounts are disabled in production");
  });

  it('fails production sign-up email flow explicitly when auth email provider is not configured', async () => {
    const response = await apiWorker.fetch(
      new Request("https://serplists.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new-user@example.com",
          password: "password123456",
          name: "New User",
        }),
      }),
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("Auth email is temporarily unavailable. Please contact support.");
    expect(data.code).toBe("auth_email_unavailable");
  });

  it('fails password reset flow explicitly when auth email provider is not configured', async () => {
    const response = await apiWorker.fetch(
      new Request("http://localhost/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing-user@example.com",
          redirectTo: "http://localhost:8080/reset-password",
        }),
      }),
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("Auth email is temporarily unavailable. Please contact support.");
    expect(data.code).toBe("auth_email_unavailable");
  });

  it('reports auth email unavailable in auth status when no provider is configured', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/auth/status'),
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailAuthAvailable).toBe(false);
    expect(data.emailVerificationRequired).toBe(false);
    expect(data.accountRegistrationAvailable).toBe(true);
  });

  it('reports auth email available in auth status when a provider is configured', async () => {
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/auth/status'),
      buildEnv({
        RESEND_API_KEY: 're_test_123',
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailAuthAvailable).toBe(true);
    expect(data.emailVerificationRequired).toBe(true);
    expect(data.accountRegistrationAvailable).toBe(true);
  });

  it('reports account registration unavailable on production when no auth email provider is configured', async () => {
    const response = await apiWorker.fetch(
      new Request('https://serplists.com/api/auth/status'),
      buildEnv({
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailAuthAvailable).toBe(false);
    expect(data.emailVerificationRequired).toBe(true);
    expect(data.accountRegistrationAvailable).toBe(false);
  });

  it.each([
    'https://staging.serp-checklists.pages.dev',
    'https://staging.serplists.com',
  ])('uses the explicit preview auth policy on %s', async (origin) => {
    const response = await apiWorker.fetch(
      new Request(`${origin}/api/auth/status`),
      buildEnv({
        AUTH_EMAIL_VERIFICATION_REQUIRED: 'false',
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailAuthAvailable).toBe(false);
    expect(data.emailVerificationRequired).toBe(false);
    expect(data.accountRegistrationAvailable).toBe(true);
  });

  it('uses the explicit production auth policy independently of hostname', async () => {
    const response = await apiWorker.fetch(
      new Request('https://serp-checklists.pages.dev/api/auth/status'),
      buildEnv({
        AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
        RESEND_API_KEY: undefined,
        USESEND_API_KEY: undefined,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emailAuthAvailable).toBe(false);
    expect(data.emailVerificationRequired).toBe(true);
    expect(data.accountRegistrationAvailable).toBe(false);
  });

  it('enforces CORS allowlist when configured', async () => {
    const env = buildEnv({ FRONTEND_URL: 'https://app.example.com' });

    const preflightDenied = await apiWorker.fetch(
      new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example.com' },
      }),
      env
    );

    expect(preflightDenied.status).toBe(403);

    const preflightAllowed = await apiWorker.fetch(
      new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      }),
      env
    );

    expect(preflightAllowed.status).toBe(200);
    expect(preflightAllowed.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  it('allows preflight origins listed in CORS_ALLOWED_ORIGINS', async () => {
    const env = buildEnv({
      FRONTEND_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:4173, https://preview.serplists.com',
    });

    const preflightAllowed = await apiWorker.fetch(
      new Request('http://localhost/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'http://127.0.0.1:4173' },
      }),
      env
    );

    expect(preflightAllowed.status).toBe(200);
    expect(preflightAllowed.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4173');
  });
});
