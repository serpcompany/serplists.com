import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '@functions/api/types';
import { apiEnv } from '../../../support/apiEnv';
import { DEPLOYED_HOST, FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker, silenceRequestLog } from '../../../support/apiRouter';

const ADMIN_LIMIT_PER_MINUTE = 10;
let ipCounter = 0;

function send(apiWorker: { fetch: (request: Request, env: Env) => Promise<Response> }, ip: string, method: string) {
  return apiWorker.fetch(new Request(`${DEPLOYED_HOST}/api/admin/entitlements/override`, {
    method,
    headers: { 'CF-Connecting-IP': ip, 'X-Admin-Secret': `guess-${ipCounter}-${Math.random()}` },
  }), apiEnv({
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ENTITLEMENTS_ADMIN_SECRET: 'the-real-admin-secret',
  }));
}

describe('API router admin rate limit', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  let ip: string;

  beforeEach(() => {
    ipCounter += 1;
    ip = `203.0.113.${ipCounter}`;
    silenceRequestLog();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['GET', 'HEAD', 'POST'])('answers 429 once one IP sends too many %s requests with guessed secrets', async (method) => {
    const apiWorker = await freshApiWorker();

    for (let index = 0; index < ADMIN_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(apiWorker, ip, method)).status).not.toBe(429);
    }
    const limited = await send(apiWorker, ip, method);

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
