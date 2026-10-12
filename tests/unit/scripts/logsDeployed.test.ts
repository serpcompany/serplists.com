import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DEPLOYED_WORKERS, runDeployedLogQuery } from '../../../scripts/lib/logsDeployed';
import { firstOf } from '../../support/elements';
import { readWranglerToml } from '../../support/wranglerToml';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const TOKEN = 'stand-in-observability-token';
const NOW = Date.parse('2026-10-12T18:00:00.000Z');
const CREDENTIALS = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };

const queryBody = z.object({
  queryId: z.string(),
  view: z.literal('events'),
  dry: z.literal(true),
  limit: z.number(),
  timeframe: z.object({ from: z.number(), to: z.number() }),
  parameters: z.object({
    filters: z.array(z.object({ key: z.string(), operation: z.string(), type: z.string(), value: z.string() })),
    needle: z.object({ value: z.string() }).passthrough().optional(),
  }),
});

type Received = { method: string | undefined; url: string | undefined; authorization: string | undefined; body: string };

let received: Received[] = [];
let reply: { status: number; body: string } = { status: 200, body: '{}' };

const server: Server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  request.on('end', () => {
    received.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
    response.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(reply.body);
  });
});

let apiBase = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The stand-in API has no port');
  apiBase = `http://127.0.0.1:${address.port}/client/v4`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  received = [];
});

const minutesAgo = (minutes: number) => NOW - minutes * 60_000;

const telemetryEvent = (source: unknown, timestamp: number, metadata: Record<string, unknown> = {}) => ({
  dataset: 'cloudflare-workers',
  timestamp,
  source,
  $metadata: { id: `event-${timestamp}`, level: 'error', service: DEPLOYED_WORKERS.staging, ...metadata },
  $workers: { scriptName: DEPLOYED_WORKERS.staging, eventType: 'fetch', outcome: 'ok' },
});

const answerWith = (events: unknown[], count = events.length) => {
  reply = { status: 200, body: JSON.stringify({ success: true, errors: [], messages: [], result: { events: { count, events } } }) };
};

const clientError = (requestId: string, kind: string, minutes: number) => ({
  level: 'error',
  message: 'client_error',
  requestId,
  kind,
  errorName: 'TypeError',
  errorMessage: 'x is undefined',
  path: '/templates/',
  timestamp: new Date(minutesAgo(minutes)).toISOString(),
});

const run = (args: string[], env: Record<string, string | undefined> = CREDENTIALS) =>
  runDeployedLogQuery(args, { env, nowMs: NOW, apiBase });

describe('pnpm run logs:deployed', () => {
  it("asks Cloudflare for the chosen Worker's events in the window, saving nothing, and prints them as logs:query does", async () => {
    answerWith([
      telemetryEvent(clientError('req-2', 'error', 1), minutesAgo(1)),
      telemetryEvent(JSON.stringify(clientError('req-1', 'boundary', 5)), minutesAgo(5)),
    ]);

    const { output, exitCode } = await run(['--', '--env', 'staging', '--since', '2h', '--level', 'error', '--event', 'client_error']);

    expect(exitCode).toBe(0);
    expect(output.split('\n')).toEqual([
      '2 of 2 matching lines',
      '17:55:00.000 error client_error requestId=req-1 kind=boundary errorName=TypeError errorMessage="x is undefined" path=/templates/',
      '17:59:00.000 error client_error requestId=req-2 kind=error errorName=TypeError errorMessage="x is undefined" path=/templates/',
    ]);
    const request = firstOf(received);
    expect(request).toMatchObject({
      method: 'POST',
      url: `/client/v4/accounts/${ACCOUNT_ID}/workers/observability/telemetry/query`,
      authorization: `Bearer ${TOKEN}`,
    });
    const query = queryBody.parse(JSON.parse(request.body));
    expect(query.timeframe).toEqual({ from: NOW - 2 * 3_600_000, to: NOW });
    expect(query.parameters.filters).toEqual([
      { key: '$metadata.service', operation: 'eq', type: 'string', value: 'serp-checklists-preview' },
      { key: '$metadata.level', operation: 'in', type: 'string', value: 'error' },
    ]);
    expect(query.parameters.needle?.value).toBe('client_error');
  });

  it("reads Production's Worker over the last hour by default", async () => {
    answerWith([]);

    const { output, exitCode } = await run(['--env', 'production']);

    expect({ output, exitCode }).toEqual({ output: 'No lines match.', exitCode: 0 });
    const query = queryBody.parse(JSON.parse(firstOf(received).body));
    expect(query.timeframe).toEqual({ from: minutesAgo(60), to: NOW });
    expect(query.parameters.filters).toEqual([
      { key: '$metadata.service', operation: 'eq', type: 'string', value: 'serp-checklists-production' },
    ]);
  });

  it("shows the Worker's uncaught exceptions and other console output, scrubbed of emails, tokens and queries", async () => {
    answerWith([
      telemetryEvent({ exception: { name: 'Error', message: 'boom for alice@example.com' } }, minutesAgo(3)),
      telemetryEvent('Failed GET /share/abc?x=1 in render', minutesAgo(2)),
    ]);

    const { output } = await run(['--env', 'staging']);

    expect(output.split('\n')).toEqual([
      '2 of 2 matching lines',
      '17:57:00.000 error exception errorName=Error errorMessage="boom for [email]"',
      '17:58:00.000 error console detail="Failed GET /share/:token in render"',
    ]);
  });

  it('narrows what Cloudflare sends by --where, --path and --status, as logs:query does', async () => {
    answerWith([
      telemetryEvent(clientError('req-1', 'boundary', 5), minutesAgo(5)),
      telemetryEvent(clientError('req-2', 'error', 1), minutesAgo(1)),
    ]);

    const { output } = await run(['--env', 'staging', '--where', 'kind=boundary', '--path', '/templates']);

    expect(output.split('\n').slice(0, 2)).toEqual([
      '1 of 1 matching lines',
      expect.stringContaining('requestId=req-1 kind=boundary'),
    ]);
  });

  it('says when Cloudflare matched more events than it sent', async () => {
    answerWith([telemetryEvent(clientError('req-1', 'boundary', 5), minutesAgo(5))], 120);

    const { output } = await run(['--env', 'staging', '--limit', '1']);

    expect(output.split('\n').at(-1)).toBe('Cloudflare matched 120 events; narrow --since or raise --limit to see more.');
    expect(queryBody.parse(JSON.parse(firstOf(received).body)).limit).toBe(1);
  });

  it('explains how to make a token when CLOUDFLARE_API_TOKEN is missing, and calls nothing', async () => {
    const { output, exitCode } = await run(['--env', 'staging'], { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID });

    expect(exitCode).toBe(1);
    expect(output).toContain('CLOUDFLARE_API_TOKEN is not set');
    expect(output).toContain('Workers Observability');
    expect(received).toEqual([]);
  });

  it("refuses a CLOUDFLARE_ACCOUNT_ID that is not an account's id", async () => {
    const { output, exitCode } = await run(['--env', 'staging'], { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: 'serp' });

    expect(exitCode).toBe(1);
    expect(output).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(received).toEqual([]);
  });

  it('says Cloudflare refused the token, and how to make one, without printing the token', async () => {
    reply = { status: 403, body: JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }], result: null }) };

    const { output, exitCode } = await run(['--env', 'production']);

    expect(exitCode).toBe(1);
    expect(output).toContain('Cloudflare refused the token (403: Authentication error)');
    expect(output).not.toContain(TOKEN);
  });

  it('fails on an answer it cannot read', async () => {
    reply = { status: 200, body: 'not json' };

    const { output, exitCode } = await run(['--env', 'staging']);

    expect(exitCode).toBe(1);
    expect(output).toContain("an answer this command can't read");
  });

  it('fails when Cloudflare cannot be reached', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const address = closed.address();
    if (address === null || typeof address === 'string') throw new Error('The closed server has no port');
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const result = await runDeployedLogQuery(['--env', 'staging'], {
      env: CREDENTIALS,
      nowMs: NOW,
      apiBase: `http://127.0.0.1:${address.port}/client/v4`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Could not reach the Cloudflare API');
  });

  it.each([[[]], [['--env', 'preview']], [['--env', 'staging', '--limit', '2001']], [['--env', 'staging', 'errors']]])(
    'answers %j with the usage and exit code 2',
    async (args) => {
      const { output, exitCode } = await run(args);

      expect(exitCode).toBe(2);
      expect(output).toContain('Usage: pnpm run logs:deployed');
      expect(received).toEqual([]);
    },
  );

  it('reads the Workers wrangler.toml deploys for each environment', () => {
    const services = z.array(z.object({ binding: z.string(), service: z.string() }));
    const { env } = readWranglerToml();

    expect(services.parse(env.preview['services'])).toContainEqual({ binding: 'WORKER_SELF_REFERENCE', service: DEPLOYED_WORKERS.staging });
    expect(services.parse(env.production['services'])).toContainEqual({ binding: 'WORKER_SELF_REFERENCE', service: DEPLOYED_WORKERS.production });
  });
});
