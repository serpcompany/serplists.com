import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiEnv, TEST_AUTH_SECRET } from '../../../support/apiEnv';
import { aFreshIp, captureLogLines, DEPLOYED_HOST, FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker } from '../../../support/apiRouter';
import { logLineIn } from '../../../support/storedJson';

const TEMPLATES_MODULE = '../../../../functions/api/handlers/templates';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const WORKER_COMMIT = 'fedcba9876543210fedcba9876543210fedcba98';
const REPORTS_PER_MINUTE = 10;
const WORST_CASE_BUDGET_MS = 15;
const LONGEST_LINE_READ = 2_000;
const LONGEST_LINES_IN_A_REPORT = 7;
const FROM_THE_SITE = { 'Content-Type': 'application/json', Origin: DEPLOYED_HOST };
const SITE_FRAME = `    at render (${DEPLOYED_HOST}/_next/static/chunks/page.js?v=1:4:56)`;
const LOGGED_SITE_FRAME = 'at render (/_next/static/chunks/page.js:4:56)';

const aReport = {
  kind: 'boundary',
  name: 'TypeError',
  stack: SITE_FRAME,
  path: '/share/3f2c9a1e-5d4b-4c1a-9b7e-2f1d0c9b8a7e/?ref=email',
  release: COMMIT,
};

const longestFrameRead = (index: number) => {
  const end = '.js:1:2)';
  return `    at step${index} (${DEPLOYED_HOST}/_next/static/chunks/`.padEnd(LONGEST_LINE_READ - end.length, ':1') + end;
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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  type Sent = { method?: string; headers?: Record<string, string>; body?: string };

  const requestFor = (init: Sent, path: string) =>
    new Request(`${DEPLOYED_HOST}/api/${path}`, {
      method: init.method ?? 'POST',
      headers: { 'CF-Connecting-IP': ip, ...(init.headers ?? FROM_THE_SITE) },
      ...(init.body === undefined ? {} : { body: init.body }),
    });

  const send = async (init: Sent, path = 'client-errors') =>
    (await freshApiWorker()).fetch(requestFor(init, path), apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET }));

  const clientErrorLines = () =>
    lines.filter((line) => line.startsWith('{')).map(logLineIn).filter((line) => line.message === 'client_error');

  it("logs one client_error line of the report's frames, path and commits, never a message, and answers 204 with no body", async () => {
    vi.stubEnv('NEXT_PUBLIC_RELEASE_COMMIT', WORKER_COMMIT);

    const response = await send({ body: JSON.stringify({ ...aReport, message: 'Cannot read the account of alice@example.com' }) });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const [line, ...others] = clientErrorLines();
    expect(others).toEqual([]);
    expect(line).toMatchObject({
      level: 'error',
      kind: 'boundary',
      errorName: 'TypeError',
      stack: LOGGED_SITE_FRAME,
      path: '/share/:token/',
      pageRelease: COMMIT,
      release: WORKER_COMMIT,
      requestId: response.headers.get('X-Request-Id'),
    });
    expect(line).not.toHaveProperty('errorMessage');
    expect(lines.join('\n')).not.toContain('alice');
    expect(lines.join('\n')).not.toContain('3f2c9a1e');
  });

  it.each([
    ['its message left on top of its frames', `TypeError: Cannot read the account of alice@example.com\n${SITE_FRAME}`, undefined],
    ['a cause appended below its frames', `${SITE_FRAME}\nCaused by: TypeError: Could not load\n${DEPLOYED_HOST}/profile/alice/q3-plan:5:6`, LOGGED_SITE_FRAME],
  ])('logs only the run of frames a stack opens with, whatever a client sends: a stack with %s', async (_label, stack, logged) => {
    const response = await send({ body: JSON.stringify({ ...aReport, stack }) });

    expect(response.status).toBe(204);
    expect(clientErrorLines().map((line) => line['stack'])).toEqual([logged]);
    expect(lines.join('\n')).not.toContain('alice');
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
    ['no path', JSON.stringify({ ...aReport, path: undefined })],
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

  it('rebuilds a report of over 14KB quickly when every line of its stack is a frame of the longest length read, as each pattern reads one line', async () => {
    const apiWorker = await freshApiWorker();
    const env = apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET });
    const stack = Array.from({ length: LONGEST_LINES_IN_A_REPORT }, (_, index) => longestFrameRead(index)).join('\n');
    const body = JSON.stringify({ ...aReport, stack, path: 'a'.repeat(500) });
    const durations: number[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = performance.now();
      const response = await apiWorker.fetch(requestFor({ body }, 'client-errors'), env);
      durations.push(performance.now() - started);
      expect(response.status).toBe(204);
    }

    expect(new Set(stack.split('\n').map((line) => line.length))).toEqual(new Set([LONGEST_LINE_READ]));
    expect(body.length).toBeGreaterThan(14 * 1024);
    expect(clientErrorLines().map((line) => String(line['stack']).split('\n').length)).toEqual(durations.map(() => LONGEST_LINES_IN_A_REPORT));
    expect(Math.min(...durations)).toBeLessThan(WORST_CASE_BUDGET_MS);
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
