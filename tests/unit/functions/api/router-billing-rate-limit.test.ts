import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A deployed, non-local host so the deployed limits apply.
const HOST = 'https://app.example.test';
const BILLING_LIMIT_PER_MINUTE = 10;
let ipCounter = 0;

function buildEnv() {
  return { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
}

function apiRequest(ip: string, method: string, path: string, host = HOST) {
  return new Request(`${host}/api/${path}`, {
    method,
    headers: {
      'CF-Connecting-IP': ip,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
}

async function loadRouter() {
  const handleBilling = vi.fn(async () => Response.json({ url: 'https://billing.stripe.test/session' }));
  const handleStripe = vi.fn(async () => Response.json({ received: true }));
  const handleTemplates = vi.fn(async () => Response.json({ ok: true }));
  vi.doMock('../../../../functions/api/handlers/billing', () => ({ handleBilling }));
  vi.doMock('../../../../functions/api/handlers/stripe', () => ({ handleStripe }));
  vi.doMock('../../../../functions/api/handlers/templates', () => ({ handleTemplates }));
  const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
  const send = (ip: string, method: string, path: string, host?: string) =>
    apiWorker.fetch(apiRequest(ip, method, path, host), buildEnv());
  return { send, handleBilling, handleStripe };
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router billing rate limit', { timeout: 30_000 }, () => {
  let ip: string;

  beforeEach(() => {
    ipCounter += 1;
    ip = `198.51.100.${ipCounter}`;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../../../../functions/api/handlers/billing');
    vi.doUnmock('../../../../functions/api/handlers/stripe');
    vi.doUnmock('../../../../functions/api/handlers/templates');
    vi.resetModules();
  });

  it.each(['billing/portal', 'billing/checkout'])('answers 429 once one IP sends too many POST %s', async (path) => {
    const { send, handleBilling } = await loadRouter();

    for (let index = 0; index < BILLING_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(ip, 'POST', path)).status).toBe(200);
    }

    const blocked = await send(ip, 'POST', path);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/try again/i);
    expect(handleBilling).toHaveBeenCalledTimes(BILLING_LIMIT_PER_MINUTE);
  });

  it('shares one budget between checkout and portal', async () => {
    const { send } = await loadRouter();

    for (let index = 0; index < BILLING_LIMIT_PER_MINUTE; index += 1) {
      const path = index % 2 === 0 ? 'billing/checkout' : 'billing/portal';
      expect((await send(ip, 'POST', path)).status).toBe(200);
    }

    expect((await send(ip, 'POST', 'billing/portal')).status).toBe(429);
    expect((await send(ip, 'POST', 'billing/checkout')).status).toBe(429);
  });

  it('never limits the billing status read that settings pages load', async () => {
    const { send } = await loadRouter();
    for (let index = 0; index < BILLING_LIMIT_PER_MINUTE; index += 1) {
      await send(ip, 'POST', 'billing/portal');
    }

    for (let index = 0; index < 50; index += 1) {
      expect((await send(ip, 'GET', 'billing/status')).status).toBe(200);
    }
  });

  it('never limits Stripe webhooks, which arrive in bursts from shared IPs', async () => {
    const { send, handleStripe } = await loadRouter();

    for (let index = 0; index < 200; index += 1) {
      expect((await send(ip, 'POST', 'stripe/webhook')).status).toBe(200);
    }
    expect(handleStripe).toHaveBeenCalledTimes(200);
  });

  it('keeps the billing budget separate from template writes', async () => {
    const { send } = await loadRouter();
    for (let index = 0; index < BILLING_LIMIT_PER_MINUTE; index += 1) {
      await send(ip, 'POST', 'billing/portal');
    }
    expect((await send(ip, 'POST', 'billing/portal')).status).toBe(429);

    expect((await send(ip, 'POST', 'templates')).status).toBe(200);
  });

  it('allows more local billing requests so local and e2e runs sharing 127.0.0.1 are not throttled', async () => {
    const { send } = await loadRouter();

    for (let index = 0; index < BILLING_LIMIT_PER_MINUTE * 3; index += 1) {
      expect((await send(ip, 'POST', 'billing/portal', 'http://localhost:8788')).status).toBe(200);
    }
  });
});
