import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A deployed, non-local host so the deployed limits apply.
const HOST = 'https://app.example.test';
const ADMIN_LIMIT_PER_MINUTE = 10;
let ipCounter = 0;

function send(apiWorker: { fetch: (request: Request, env: unknown) => Promise<Response> }, ip: string, method: string) {
  return apiWorker.fetch(new Request(`${HOST}/api/admin/entitlements/override`, {
    method,
    headers: { 'CF-Connecting-IP': ip, 'X-Admin-Secret': `guess-${ipCounter}-${Math.random()}` },
  }), {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ENTITLEMENTS_ADMIN_SECRET: 'the-real-admin-secret',
  });
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router admin rate limit', { timeout: 30_000 }, () => {
  let ip: string;

  beforeEach(() => {
    ipCounter += 1;
    ip = `203.0.113.${ipCounter}`;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['GET', 'HEAD', 'POST'])('answers 429 once one IP sends too many %s requests with guessed secrets', async (method) => {
    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');

    for (let index = 0; index < ADMIN_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(apiWorker, ip, method)).status).not.toBe(429);
    }
    const limited = await send(apiWorker, ip, method);

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
