import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiEnv, TEST_AUTH_SECRET } from '../../../support/apiEnv';
import { aFreshIp, captureLogLines, DEPLOYED_HOST, FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker } from '../../../support/apiRouter';
import { logLineIn } from '../../../support/storedJson';

const TEMPLATES_MODULE = '../../../../functions/api/handlers/templates';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const REPORTS_PER_MINUTE = 10;
const FROM_THE_SITE = { 'Content-Type': 'application/json', Origin: DEPLOYED_HOST };

const aReport = {
  kind: 'boundary',
  name: 'TypeError',
  message: 'Cannot read the account of alice@example.com',
  stack: 'TypeError: Cannot read\n    at render (https://app.example.test/_next/static/chunks/page.js?v=1:4:56)',
  path: '/share/3f2c9a1e-5d4b-4c1a-9b7e-2f1d0c9b8a7e/?ref=email',
  release: COMMIT,
};

describe('POST /api/client-errors, where the browser reports its errors', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  let lines: string[];
  let ip: string;
  const handleTemplates = vi.fn(async () => Response.json({ ok: true }));

  beforeEach(() => {
    ip = aFreshIp('198.51.100').ip;
    handleTemplates.mockClear();
    vi.doMock(TEMPLATES_MODULE, () => ({ handleTemplates }));
    lines = captureLogLines(['debug', 'info', 'warn', 'error']);
  });

  afterEach(() => {
    vi.doUnmock(TEMPLATES_MODULE);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const send = async (init: { method?: string; headers?: Record<string, string>; body?: string }, path = 'client-errors') => {
    const apiWorker = await freshApiWorker();
    const request = new Request(`${DEPLOYED_HOST}/api/${path}`, {
      method: init.method ?? 'POST',
      headers: { 'CF-Connecting-IP': ip, ...(init.headers ?? FROM_THE_SITE) },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    return apiWorker.fetch(request, apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET }));
  };

  const clientErrorLines = () =>
    lines.filter((line) => line.startsWith('{')).map(logLineIn).filter((line) => line.message === 'client_error');

  it('logs one client_error line from the report, scrubbed, and answers 204 with no body', async () => {
    const response = await send({ body: JSON.stringify(aReport) });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const [line, ...others] = clientErrorLines();
    expect(others).toEqual([]);
    expect(line).toMatchObject({
      level: 'error',
      kind: 'boundary',
      errorName: 'TypeError',
      errorMessage: 'Cannot read the account of [email]',
      stack: 'TypeError: Cannot read\n    at render (https://app.example.test/_next/static/chunks/page.js:4:56)',
      path: '/share/:token/',
      release: COMMIT,
      requestId: response.headers.get('X-Request-Id'),
    });
    expect(lines.join('\n')).not.toContain('alice@example.com');
    expect(lines.join('\n')).not.toContain('3f2c9a1e');
  });

  it.each([
    ['a form', { 'Content-Type': 'application/x-www-form-urlencoded', Origin: DEPLOYED_HOST }, 415],
    ['text/plain', { 'Content-Type': 'text/plain', Origin: DEPLOYED_HOST }, 415],
    ['another site', { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, 403],
    ['another site that sends no Origin', { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, 403],
  ])('refuses a report sent as %s, and logs nothing from it', async (_label, headers, status) => {
    const response = await send({ headers, body: JSON.stringify(aReport) });

    expect(response.status).toBe(status);
    expect(clientErrorLines()).toEqual([]);
  });

  it.each([
    ['JSON it cannot parse', '{"kind":'],
    ['a kind it does not know', JSON.stringify({ ...aReport, kind: 'warning' })],
    ['no message', JSON.stringify({ ...aReport, message: undefined })],
    ['a release that is not a commit', JSON.stringify({ ...aReport, release: 'main' })],
  ])('refuses a report with %s with 400, and logs nothing from it', async (_label, body) => {
    const response = await send({ body });

    expect(response.status).toBe(400);
    expect(clientErrorLines()).toEqual([]);
  });

  it('answers 405 to anything but POST', async () => {
    const response = await send({ method: 'GET', headers: {} });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('refuses a report over 16KB with 413 before reading it', async () => {
    const response = await send({ body: JSON.stringify({ ...aReport, stack: 'x'.repeat(17 * 1024) }) });

    expect(response.status).toBe(413);
    expect(clientErrorLines()).toEqual([]);
  });

  it('takes 10 reports a minute from a client, in a budget of its own, so a burst of reports never blocks a save', async () => {
    for (let report = 0; report < REPORTS_PER_MINUTE; report += 1) {
      expect((await send({ body: JSON.stringify(aReport) })).status).toBe(204);
    }

    const limited = await send({ body: JSON.stringify(aReport) });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(clientErrorLines()).toHaveLength(REPORTS_PER_MINUTE);

    const save = await send({ body: '{}' }, 'templates');
    expect(save.status).toBe(200);
    expect(handleTemplates).toHaveBeenCalledTimes(1);
  });
});
