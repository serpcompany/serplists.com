import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { elementAt } from '../../support/elements';

import { DEPLOYMENT_PROBE_PATHS, verifyDeployment } from '../../../scripts/verify-deployment';
import { SMOKE_TEST_HEADER } from '@/lib/seo/siteOrigin';

const BASE_URL = 'https://serp-checklists-preview.serp.workers.dev';

type Reply = number | Error;

const stubFetchAnsweringEachUrlFromItsList = (replies: Record<string, Reply[]>) => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const list = replies[url.slice(BASE_URL.length)] ?? [200];
    const reply = elementAt(list, Math.min(calls.filter((call) => call === url).length, list.length) - 1);
    if (reply instanceof Error) throw reply;
    return new Response(null, { status: reply });
  };
  return { fetchImpl, calls };
};

const noResponse = () => new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });

const run = async (replies: Record<string, Reply[]>, overrides: Record<string, unknown> = {}) => {
  const { fetchImpl, calls } = stubFetchAnsweringEachUrlFromItsList(replies);
  const lines: string[] = [];
  const sleeps: number[] = [];
  const exitCode = await verifyDeployment({
    baseUrl: BASE_URL,
    fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    log: (line: string) => lines.push(line),
    ...overrides,
  });
  return { exitCode, output: lines.join('\n'), calls, sleeps };
};

describe('verifyDeployment', () => {
  it('fails when the deployment never gives an HTTP response, waiting between tries but not after the last', async () => {
    const { exitCode, output, calls, sleeps } = await run({ '/api/health': [noResponse()] });

    expect(exitCode).toBe(1);
    expect(output).toContain('::error::');
    expect(output).toContain(`${BASE_URL}/api/health gave no response`);
    expect(output).toContain('ECONNREFUSED');
    expect(output).not.toContain('::warning::');
    expect(calls).toHaveLength(6);
    expect(sleeps).toEqual([10_000, 10_000, 10_000, 10_000, 10_000]);
  });

  it('fails on a real connection that is refused', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const lines: string[] = [];
    const exitCode = await verifyDeployment({
      baseUrl: `http://127.0.0.1:${port}`,
      attempts: 1,
      timeoutMs: 5_000,
      log: (line: string) => lines.push(line),
    });

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('gave no response');
  });

  it('fails when a probe times out', async () => {
    const hang = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const lines: string[] = [];
    const exitCode = await verifyDeployment({
      baseUrl: BASE_URL,
      attempts: 1,
      timeoutMs: 10,
      fetchImpl: hang,
      log: (line: string) => lines.push(line),
    });

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('gave no response');
  });

  it('fails on a 5xx after the retries', async () => {
    const { exitCode, output, calls } = await run({ '/api/templates': [503] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`${BASE_URL}/api/health -> 200`);
    expect(output).toContain(`::error::${BASE_URL}/api/templates returned 503`);
    expect(calls.filter((url) => url.endsWith('/api/templates'))).toHaveLength(6);
  });

  it('only warns on an access policy status', async () => {
    const { exitCode, output } = await run({ '/api/health': [403], '/api/templates': [302] });

    expect(exitCode).toBe(0);
    expect(output).toContain(`::warning::${BASE_URL}/api/health returned 403 (access policy?); could not verify.`);
    expect(output).toContain(`::warning::${BASE_URL}/api/templates returned 302`);
    expect(output).not.toContain('::error::');
  });

  it('passes once both paths answer 200, retrying while the hostname comes up', async () => {
    const { exitCode, output, calls } = await run({ '/api/health': [noResponse(), noResponse(), 200] });

    expect(exitCode).toBe(0);
    expect(output).toContain(`${BASE_URL}/api/health -> 200`);
    expect(output).toContain(`${BASE_URL}/api/templates -> 200`);
    expect(calls).toEqual([
      `${BASE_URL}/api/health`,
      `${BASE_URL}/api/health`,
      `${BASE_URL}/api/health`,
      `${BASE_URL}/api/templates`,
    ]);
  });

  it('does not follow redirects, so an access redirect is reported rather than its login page', async () => {
    const inits: Array<RequestInit | undefined> = [];
    await verifyDeployment({
      baseUrl: BASE_URL,
      fetchImpl: async (_url: string, init?: RequestInit) => {
        inits.push(init);
        return new Response(null, { status: 200 });
      },
      log: () => {},
    });

    expect(inits.every((init) => init?.redirect === 'manual')).toBe(true);
  });

  it("sends the smoke-test header, so a workers.dev address whose environment has its own domain answers instead of redirecting there", async () => {
    const inits: Array<RequestInit | undefined> = [];
    const code = await verifyDeployment({
      baseUrl: 'https://serp-checklists-preview.serpcompany.workers.dev',
      fetchImpl: async (_url: string, init?: RequestInit) => {
        inits.push(init);
        return new Response('ok', { status: 200 });
      },
      sleep: async () => {},
      log: () => {},
    });

    expect(code).toBe(0);
    expect(inits.length).toBe(DEPLOYMENT_PROBE_PATHS.length);
    expect(inits.every((init) => new Headers(init?.headers).get(SMOKE_TEST_HEADER) === '1')).toBe(true);
  });

  it('skips the probe with a warning when it is given no deployment URL', async () => {
    const { exitCode, output, calls } = await run({}, { baseUrl: '' });

    expect(exitCode).toBe(0);
    expect(output).toContain('::warning::Deployment URL not found');
    expect(calls).toEqual([]);
  });
});
