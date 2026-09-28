import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEMPLATES_MODULE = '../../../../functions/api/handlers/templates';
const IP = '203.0.113.5';
const FORWARDED_IP = '198.51.100.7';

function buildEnv(overrides?: Record<string, unknown>) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  } as any;
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router logs no personal data', { timeout: 30_000 }, () => {
  const lines: string[] = [];
  const handleTemplates = vi.fn(async () => Response.json({ ok: true }));

  async function send(request: Request, env = buildEnv()) {
    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    return apiWorker.fetch(request, env);
  }

  beforeEach(() => {
    lines.length = 0;
    handleTemplates.mockReset().mockImplementation(async () => Response.json({ ok: true }));
    vi.doMock(TEMPLATES_MODULE, () => ({ handleTemplates }));
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    vi.doUnmock(TEMPLATES_MODULE);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function expectNoLineContains(...values: string[]) {
    expect(lines.length).toBeGreaterThan(0);
    for (const value of values) expect(lines.join('\n')).not.toContain(value);
    for (const line of lines) {
      if (line.startsWith('{')) expect(JSON.parse(line)).not.toHaveProperty('ip');
    }
  }

  it('keeps the client IP out of the request log', async () => {
    const response = await send(new Request('http://localhost/api/health', { headers: { 'CF-Connecting-IP': IP } }));

    expect(response.status).toBe(200);
    expectNoLineContains(IP);
  });

  it('keeps an X-Forwarded-For IP out of the request log', async () => {
    await send(
      new Request('http://localhost/api/templates?scope=public', {
        headers: { 'X-Forwarded-For': `${FORWARDED_IP}, 10.0.0.1` },
      }),
    );

    expectNoLineContains(FORWARDED_IP, '10.0.0.1');
  });

  it('keeps the client IP out of the api_error log', async () => {
    handleTemplates.mockRejectedValueOnce(new Error('boom'));

    const response = await send(new Request('http://localhost/api/templates', { headers: { 'CF-Connecting-IP': IP } }));

    expect(response.status).toBe(500);
    expect(lines.some((line) => line.includes('api_error'))).toBe(true);
    expectNoLineContains(IP);
  });

  it('logs only the domain of a blocked test-account sign-in', async () => {
    const response = await send(
      new Request('https://serplists.com/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://serplists.com', 'CF-Connecting-IP': IP },
        body: JSON.stringify({ email: 'alice@serplists.dev', password: 'password123456' }),
      }),
      buildEnv({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'true', RESEND_API_KEY: 're_test_123' }),
    );

    expect(response.status).toBe(403);
    expect(lines.some((line) => line.includes('blocked_test_user_auth'))).toBe(true);
    expectNoLineContains('alice', IP);
  });
});
