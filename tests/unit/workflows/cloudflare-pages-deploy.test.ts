import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { verifyDeployment } from '../../../scripts/verify-deployment.mjs';

// The deploy workflow probes the new deployment after `wrangler pages deploy`.
// docs/RELIABILITY.md: "A 5xx or no response fails the run; other statuses, such as
// an access policy, only warn". The probe used to run
// `code=$(curl ... -w '%{http_code}' ... || echo 000)`: when curl got no response it
// printed 000 and the fallback appended another, so `code` was 000000, which the
// classifier read as a warning and the job stayed green.

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string()).optional(),
});
const workflowSchema = z.object({
  jobs: z.object({ deploy: z.object({ steps: z.array(stepSchema) }) }),
});

const steps = workflowSchema.parse(
  yaml.load(readFileSync('.github/workflows/cloudflare-pages-deploy.yml', 'utf8')),
).jobs.deploy.steps;

const BASE_URL = 'https://abc123.serplists-com.pages.dev';

type Reply = number | Error;

/** A fetch stub that answers each URL with the next reply in its list (the last one repeats). */
const stubFetch = (replies: Record<string, Reply[]>) => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const list = replies[url.slice(BASE_URL.length)] ?? [200];
    const reply = list[Math.min(calls.filter((call) => call === url).length, list.length) - 1];
    if (reply instanceof Error) throw reply;
    return new Response(null, { status: reply });
  };
  return { fetchImpl, calls };
};

const noResponse = () => new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });

const run = async (replies: Record<string, Reply[]>, overrides: Record<string, unknown> = {}) => {
  const { fetchImpl, calls } = stubFetch(replies);
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

// The app builds for Workers through OpenNext now, so `pnpm run build` makes no ./dist and a
// Pages deploy of this code would publish a broken site. The workflow stays for its probe
// (which the Workers deploy will reuse) but cannot run.
describe('the disconnected Pages deploy', () => {
  it('fails before it builds or deploys anything', () => {
    expect(steps[0]?.run).toMatch(/\bexit 1\b/);
  });

  it('is called by no other workflow', () => {
    const callers = readdirSync('.github/workflows')
      .filter((file) => file !== 'cloudflare-pages-deploy.yml')
      .filter((file) => /uses:\s*\S*cloudflare-pages-deploy\.yml/.test(readFileSync(`.github/workflows/${file}`, 'utf8')));

    expect(callers).toEqual([]);
  });
});

describe('Cloudflare Pages deploy workflow', () => {
  it('probes the new deployment with the verify-deployment script', () => {
    const deployStep = steps.find((step) => step.id === 'deploy');
    const probeStep = steps.find((step) => step.name === 'Verify the new deployment responds');

    expect(deployStep, 'the deploy step needs id "deploy" so the probe can read its url output').toBeDefined();
    expect(probeStep?.env?.DEPLOY_URL).toBe('${{ steps.deploy.outputs.url }}');
    expect(probeStep?.run?.trim()).toBe('node scripts/verify-deployment.mjs');
    expect(steps.indexOf(probeStep!)).toBeGreaterThan(steps.indexOf(deployStep!));
  });
});

describe('verifyDeployment', () => {
  it('fails when the deployment never gives an HTTP response', async () => {
    const { exitCode, output, calls, sleeps } = await run({ '/api/health': [noResponse()] });

    expect(exitCode).toBe(1);
    expect(output).toContain('::error::');
    expect(output).toContain(`${BASE_URL}/api/health gave no response`);
    expect(output).toContain('ECONNREFUSED');
    expect(output).not.toContain('::warning::');
    expect(calls).toHaveLength(6);
    // No wait after the last try.
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

  it('skips the probe with a warning when wrangler printed no deployment URL', async () => {
    const { exitCode, output, calls } = await run({}, { baseUrl: '' });

    expect(exitCode).toBe(0);
    expect(output).toContain('::warning::Deployment URL not found');
    expect(calls).toEqual([]);
  });
});
