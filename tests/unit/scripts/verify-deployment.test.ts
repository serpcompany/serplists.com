import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { SIGN_IN_PATH, verifyDeployment } from '../../../scripts/verify-deployment';
import { SMOKE_TEST_HEADER } from '@/lib/seo/siteOrigin';
import { listeningPort } from '../../support/listeningPort';

const BASE_URL = 'https://serp-checklists-preview.serpcompany.workers.dev';
const COMMIT = '07ec182950550883a30578a6e5b50658f1134ed7';
const OLDER_COMMIT = '8ee5056fe6ac7615ea7865bb60758f9643809d60';
const INPUTS = { DEPLOY_URL: BASE_URL, RELEASE_COMMIT: COMMIT, SITE_ENV: 'staging' };
const SIGN_IN = `POST ${SIGN_IN_PATH}`;

type Reply = { status: number; body?: string } | Error;
type Call = { method: string; path: string; headers: Headers; body: string | undefined; redirect: string | undefined };

const health = (commit = COMMIT, environment = 'staging'): Reply => ({
  status: 200,
  body: JSON.stringify({ status: 'ok', release: { commit, environment } }),
});
const page = (commit = COMMIT): Reply => ({
  status: 200,
  body: `<!DOCTYPE html><html><head><meta name="serplists-release" content="${commit}"/></head></html>`,
});
const HEALTHY_DEPLOYMENT: Record<string, Reply[]> = {
  'GET /api/health': [health()],
  'GET /api/templates': [{ status: 200, body: '{"templates":[]}' }],
  'GET /about/': [page()],
  [SIGN_IN]: [{ status: 401, body: '{"code":"INVALID_EMAIL_OR_PASSWORD"}' }],
};

const noResponse = () => new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }) });

const signInBody = z.object({ email: z.string().email(), password: z.string().min(8) });

const requestInit = z.object({
  method: z.string(),
  headers: z.record(z.string()),
  body: z.string().optional(),
  redirect: z.string().optional(),
});

function aDeploymentAnswering(replies: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: unknown) => {
    const { method, headers, body, redirect } = requestInit.parse(init);
    const path = url.slice(BASE_URL.length);
    calls.push({ method, path, headers: new Headers(headers), body, redirect });
    const list = replies[`${method} ${path}`] ?? [{ status: 404 }];
    const reply = list[Math.min(calls.filter((call) => call.method === method && call.path === path).length, list.length) - 1];
    if (reply === undefined || reply instanceof Error) throw reply ?? new Error('no reply');
    return new Response(reply.body ?? null, { status: reply.status });
  };
  return { fetchImpl, calls };
}

async function smokeTest(changes: Record<string, Reply[]> = {}, inputs: Record<string, string> = INPUTS) {
  const { fetchImpl, calls } = aDeploymentAnswering({ ...HEALTHY_DEPLOYMENT, ...changes });
  const lines: string[] = [];
  const sleeps: number[] = [];
  const exitCode = await verifyDeployment(inputs, {
    fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    log: (line: string) => lines.push(line),
  });
  return { exitCode, output: lines.join('\n'), calls, sleeps };
}

const callsTo = (calls: Call[], key: string) => calls.filter((call) => `${call.method} ${call.path}` === key);

describe('the smoke test of a new deployment', () => {
  it('passes a deployment that is up, reports the commit just deployed on its health route and its pages, serves the Template list and refuses a bad sign-in', async () => {
    const { exitCode, output, calls, sleeps } = await smokeTest();

    expect(exitCode).toBe(0);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /api/health', 'GET /api/templates', 'GET /about/', SIGN_IN]);
    expect(output).toContain(`GET ${BASE_URL}/api/health -> 200, commit ${COMMIT}, staging`);
    expect(output).toContain(`GET ${BASE_URL}/about/ -> 200, release ${COMMIT}`);
    expect(output).toContain(`POST ${BASE_URL}${SIGN_IN_PATH} -> 401`);
    expect(sleeps).toEqual([]);
  });

  it("sends the smoke-test header and follows no redirect, so it tests the workers.dev address rather than the host that address redirects to", async () => {
    const { calls } = await smokeTest();

    expect(calls.every((call) => call.headers.get(SMOKE_TEST_HEADER) === '1' && call.redirect === 'manual')).toBe(true);
  });

  it('signs in as JSON from the deployment itself, as an account made up for each run that the repository names nowhere, so no one can register it first', async () => {
    const signInOf = async () => {
      const [signIn] = callsTo((await smokeTest()).calls, SIGN_IN);
      expect(signIn?.headers.get('content-type')).toBe('application/json');
      expect(signIn?.headers.get('origin')).toBe(BASE_URL);
      return signInBody.parse(JSON.parse(signIn?.body ?? '{}'));
    };
    const [first, second] = [await signInOf(), await signInOf()];
    const inTheRepository = spawnSync('git', ['grep', '--quiet', '--fixed-strings', '-e', first.email, '-e', first.password, '-e', second.email, '-e', second.password]);

    expect(second.email).not.toBe(first.email);
    expect(second.password).not.toBe(first.password);
    expect(inTheRepository.status).toBe(1);
  });

  it.each([
    ['no deployment URL', { ...INPUTS, DEPLOY_URL: '' }],
    ['no release commit', { ...INPUTS, RELEASE_COMMIT: '' }],
    ['a release commit that is not a full SHA', { ...INPUTS, RELEASE_COMMIT: 'unknown' }],
    ['no environment', { DEPLOY_URL: BASE_URL, RELEASE_COMMIT: COMMIT }],
  ])('fails without a request when it is given %s', async (_case, inputs) => {
    const { exitCode, output, calls } = await smokeTest({}, inputs);

    expect(exitCode).toBe(1);
    expect(output).toContain('::error::The smoke test needs DEPLOY_URL, RELEASE_COMMIT and SITE_ENV');
    expect(calls).toEqual([]);
  });

  it('fails when the deployment never gives an HTTP response, waiting between tries but not after the last', async () => {
    const { exitCode, output, calls, sleeps } = await smokeTest({ 'GET /api/health': [noResponse()] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`::error::GET ${BASE_URL}/api/health gave no response (ECONNREFUSED)`);
    expect(calls).toHaveLength(6);
    expect(sleeps).toEqual([10_000, 10_000, 10_000, 10_000, 10_000]);
  });

  it.each([403, 302, 404, 503])('fails when /api/templates keeps answering %i, as it would for an access policy, a redirect or a missing binding', async (status) => {
    const { exitCode, output, calls } = await smokeTest({ 'GET /api/templates': [{ status }] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`::error::GET ${BASE_URL}/api/templates answered ${status}, not 200`);
    expect(callsTo(calls, 'GET /api/templates')).toHaveLength(6);
  });

  it('fails when /api/health answers something other than 200', async () => {
    const { exitCode, output } = await smokeTest({ 'GET /api/health': [{ status: 401 }] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`::error::GET ${BASE_URL}/api/health answered 401, not 200`);
  });

  it('waits while the previous deployment still answers, and passes once the health route and the page report the new commit', async () => {
    const { exitCode, calls } = await smokeTest({
      'GET /api/health': [health(OLDER_COMMIT), health(OLDER_COMMIT), health()],
      'GET /about/': [page(OLDER_COMMIT), page()],
    });

    expect(exitCode).toBe(0);
    expect(callsTo(calls, 'GET /api/health')).toHaveLength(3);
    expect(callsTo(calls, 'GET /about/')).toHaveLength(2);
  });

  it('fails when the health route never reports the commit just deployed, as a build without NEXT_PUBLIC_RELEASE_COMMIT does', async () => {
    const { exitCode, output } = await smokeTest({ 'GET /api/health': [health('unknown')] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`::error::GET ${BASE_URL}/api/health reports commit unknown, not ${COMMIT}, the commit just deployed`);
  });

  it('fails when the health route answers without a release', async () => {
    const { exitCode, output } = await smokeTest({ 'GET /api/health': [{ status: 200, body: '{"status":"ok"}' }] });

    expect(exitCode).toBe(1);
    expect(output).toContain('answered without {"status":"ok","release":');
  });

  it('fails at once when the deployment reports another environment, which waiting cannot change', async () => {
    const { exitCode, output, calls } = await smokeTest({ 'GET /api/health': [health(COMMIT, 'production')] });

    expect(exitCode).toBe(1);
    expect(output).toContain('reports environment production, not staging');
    expect(callsTo(calls, 'GET /api/health')).toHaveLength(1);
  });

  it.each([
    ['carries no release tag', { status: 200, body: '<html><head></head></html>' }, 'has no <meta name="serplists-release"'],
    ['names another commit', page(OLDER_COMMIT), `names release ${OLDER_COMMIT}, not ${COMMIT}`],
  ])('fails when a page %s, since a page can answer from an older build than the health route', async (_case, reply, message) => {
    const { exitCode, output } = await smokeTest({ 'GET /about/': [reply] });

    expect(exitCode).toBe(1);
    expect(output).toContain(message);
  });

  it('passes when the sign-in is refused as forbidden', async () => {
    expect((await smokeTest({ [SIGN_IN]: [{ status: 403 }] })).exitCode).toBe(0);
  });

  it.each([200, 204, 302, 400, 429])('fails at once, signing in only once, when the sign-in answers %i', async (status) => {
    const { exitCode, output, calls } = await smokeTest({ [SIGN_IN]: [{ status }] });

    expect(exitCode).toBe(1);
    expect(output).toContain(`::error::POST ${BASE_URL}${SIGN_IN_PATH} answered ${status} to a made-up account with a wrong password`);
    expect(callsTo(calls, SIGN_IN)).toHaveLength(1);
  });

  it('tries the sign-in again after a server error, and passes once it is refused', async () => {
    const { exitCode, calls } = await smokeTest({ [SIGN_IN]: [{ status: 503 }, { status: 401 }] });

    expect(exitCode).toBe(0);
    expect(callsTo(calls, SIGN_IN)).toHaveLength(2);
  });

  it('fails on a real connection that is refused', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = listeningPort(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const lines: string[] = [];

    const exitCode = await verifyDeployment(
      { ...INPUTS, DEPLOY_URL: `http://127.0.0.1:${port}` },
      { attempts: 1, timeoutMs: 5_000, log: (line: string) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('gave no response');
  });

  it('fails when a probe times out', async () => {
    const hang = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('timed out')));
      });
    const lines: string[] = [];

    const exitCode = await verifyDeployment(INPUTS, { attempts: 1, timeoutMs: 10, fetchImpl: hang, log: (line: string) => lines.push(line) });

    expect(exitCode).toBe(1);
    expect(lines.join('\n')).toContain('gave no response');
  });
});
