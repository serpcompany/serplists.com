import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A deployed, non-local host so the tight deployed limits apply.
const HOST = 'https://app.example.test';
let ipCounter = 0;

function buildEnv() {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    RESEND_API_KEY: 're_test_key',
  } as any;
}

function authRequest(ip: string, method: string, path: string) {
  return new Request(`${HOST}/api/${path}`, {
    method,
    headers: {
      'CF-Connecting-IP': ip,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
}

async function loadRouter() {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  vi.doMock('../../../../functions/api/better-auth', () => ({
    createBetterAuth: vi.fn(() => ({ handler })),
  }));
  const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
  const send = (ip: string, method: string, path: string) =>
    apiWorker.fetch(authRequest(ip, method, path), buildEnv());
  return { send, handler };
}

describe('authRateLimitBucket', () => {
  it.each([
    ['GET', 'auth/get-session', 'session'],
    ['GET', 'auth/status', 'session'],
    ['POST', 'auth/get-session', 'credential'],
    ['POST', 'auth/status', 'credential'],
    ['GET', 'auth/get-session/', 'credential'],
    ['GET', 'auth/verify-email', 'credential'],
    ['POST', 'auth/sign-in/email', 'credential'],
    ['POST', 'auth/sign-in/username', 'credential'],
    ['POST', 'auth/sign-up/email', 'credential'],
    ['POST', 'auth/request-password-reset', 'credential'],
    ['POST', 'auth/forget-password', 'credential'],
    ['POST', 'auth/change-email', 'credential'],
    ['POST', 'auth/some-future-endpoint', 'credential'],
    ['GET', 'templates', null],
    ['POST', 'checklists/shared/abc', null],
  ])('%s %s -> %s', async (method, path, expected) => {
    const { authRateLimitBucket } = await import('../../../../functions/api/utils/auth-rate-limit');
    expect(authRateLimitBucket(method, path)).toBe(expected);
  });
});

// Each test imports the whole router graph fresh and sends hundreds of requests.
describe('API router auth rate limits', { timeout: 30_000 }, () => {
  let ip: string;

  beforeEach(() => {
    ipCounter += 1;
    ip = `203.0.113.${ipCounter}`;
    // Hundreds of requests per test; keep the per-request log line out of the output.
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../../../../functions/api/better-auth');
    vi.resetModules();
  });

  it('does not count session checks against the sign-in limit', async () => {
    const { send } = await loadRouter();

    for (let index = 0; index < 100; index += 1) {
      const sessionCheck = await send(ip, 'GET', 'auth/get-session');
      expect(sessionCheck.status).toBe(200);
    }
    for (let index = 0; index < 10; index += 1) {
      const status = await send(ip, 'GET', 'auth/status');
      expect(status.status).toBe(200);
    }

    for (let index = 0; index < 30; index += 1) {
      const signIn = await send(ip, 'POST', 'auth/sign-in/email');
      expect(signIn.status).toBe(200);
    }

    const blocked = await send(ip, 'POST', 'auth/sign-in/email');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    // Exhausting the credential bucket must not log signed-in users out.
    const afterBlock = await send(ip, 'GET', 'auth/get-session');
    expect(afterBlock.status).toBe(200);
  });

  it('keeps every other auth route in the tight bucket', async () => {
    const { send } = await loadRouter();
    const strictRoutes: Array<[string, string]> = [
      ['POST', 'auth/sign-in/username'],
      ['POST', 'auth/sign-up/email'],
      ['POST', 'auth/request-password-reset'],
      ['POST', 'auth/reset-password'],
      ['POST', 'auth/send-verification-email'],
      ['POST', 'auth/change-password'],
      ['GET', 'auth/verify-email'],
      ['GET', 'auth/reset-password/some-token'],
      ['POST', 'auth/is-username-available'],
      ['POST', 'auth/get-session'],
      ['GET', 'auth/get-session/'],
      ['GET', 'auth/some-future-endpoint'],
    ];

    for (let index = 0; index < 30; index += 1) {
      const [method, path] = strictRoutes[index % strictRoutes.length];
      const response = await send(ip, method, path);
      expect(response.status, `${method} ${path}`).not.toBe(429);
    }

    for (const [method, path] of strictRoutes) {
      const response = await send(ip, method, path);
      expect(response.status, `${method} ${path}`).toBe(429);
    }
  });

  it('limits an IPv6 client per /64, not per address', async () => {
    const { send } = await loadRouter();
    const network = `2001:db8:${ipCounter.toString(16)}:2`;

    for (let index = 1; index <= 30; index += 1) {
      const response = await send(`${network}::${index.toString(16)}`, 'POST', 'auth/sign-in/email');
      expect(response.status).toBe(200);
    }

    const blocked = await send(`${network}:ffff:ffff:ffff:ffff`, 'POST', 'auth/sign-in/email');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    const otherNetwork = await send(`2001:db8:${ipCounter.toString(16)}:3::1`, 'POST', 'auth/sign-in/email');
    expect(otherNetwork.status).toBe(200);
  });

  it('still caps session checks at their own, larger limit', async () => {
    const { send } = await loadRouter();

    for (let index = 0; index < 600; index += 1) {
      const response = await send(ip, 'GET', 'auth/get-session');
      expect(response.status).toBe(200);
    }

    const blocked = await send(ip, 'GET', 'auth/get-session');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    const signIn = await send(ip, 'POST', 'auth/sign-in/email');
    expect(signIn.status).toBe(200);
  });
});
