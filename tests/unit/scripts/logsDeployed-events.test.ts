import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runDeployedLogQuery } from '../../../scripts/lib/logsDeployed';
import { stringContaining } from '../../support/asymmetricMatchers';

const NOW = Date.parse('2026-10-12T18:00:00.000Z');
const CREDENTIALS = { CLOUDFLARE_API_TOKEN: 'stand-in-observability-token', CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' };

const needleBody = z.object({ parameters: z.object({ needle: z.object({ value: z.string() }).passthrough().optional() }).passthrough() }).passthrough();

const cloudflareAnswering = (answer: unknown) => {
  const bodies: string[] = [];
  const fetchImpl = (_url: string, init: { body: string }) => {
    bodies.push(init.body);
    return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
  };
  return { bodies, fetchImpl };
};

const withEvents = (events: unknown[]) => ({ success: true, errors: [], result: { events: { events } } });

const consoleEvent = (source: unknown, metadata: Record<string, unknown>) => ({ timestamp: NOW - 60_000, source, $metadata: metadata });

const run = (args: string[], answer: unknown) => {
  const cloudflare = cloudflareAnswering(answer);
  return { cloudflare, result: runDeployedLogQuery(args, { env: CREDENTIALS, nowMs: NOW, fetchImpl: cloudflare.fetchImpl }) };
};

const sentNeedle = (cloudflare: { bodies: string[] }) => cloudflare.bodies.map((body) => needleBody.parse(JSON.parse(body)).parameters.needle?.value);

describe('pnpm run logs:deployed console events', () => {
  it("reads a console event's text from its message, then its error, and its level from Cloudflare's, as info when it has none it knows", async () => {
    const { result } = run(
      ['--env', 'staging'],
      withEvents([
        consoleEvent({ worker: 'render' }, { level: 'WARN', message: 'slow render' }),
        consoleEvent({ worker: 'render' }, { level: 'trace', error: 'render failed' }),
        consoleEvent({ worker: 'render' }, { statusCode: 502 }),
      ]),
    );

    expect((await result).output.split('\n')).toEqual([
      '3 of 3 matching lines',
      '17:59:00.000 warn  console detail="slow render"',
      '17:59:00.000 info  console detail="render failed"',
      '17:59:00.000 info  console detail= status=502',
    ]);
  });

  it('prints nothing when Cloudflare answers success with no result', async () => {
    const { result } = run(['--env', 'production'], { success: true, errors: [], result: null });

    expect(await result).toMatchObject({ output: 'No lines match.', exitCode: 0 });
  });

  it("fails the run with the connection's error when Cloudflare's answer breaks off, rather than reporting it as a usage problem or as no lines", async () => {
    const brokenOff = new ReadableStream({
      start: (controller) => controller.error(new Error('socket hang up')),
    });
    const fetchImpl = () => Promise.resolve(new Response(brokenOff, { status: 200 }));

    await expect(runDeployedLogQuery(['--env', 'staging'], { env: CREDENTIALS, nowMs: NOW, fetchImpl })).rejects.toThrow('socket hang up');
  });
});

describe('pnpm run logs:deployed search text', () => {
  it('asks Cloudflare for the request id when there is one, ahead of an event', async () => {
    const { cloudflare, result } = run(['--env', 'staging', '--request', 'req-7', '--event', 'api_error'], withEvents([]));
    await result;

    expect(sentNeedle(cloudflare)).toEqual(['req-7']);
  });

  it('asks for no search text when there are two events, and filters them after', async () => {
    const { cloudflare, result } = run(['--env', 'staging', '--event', 'api_error', '--event', 'client_error'], withEvents([]));
    await result;

    expect(sentNeedle(cloudflare)).toEqual([undefined]);
  });

  it('prints the usage for --help, and asks Cloudflare nothing', async () => {
    const { cloudflare, result } = run(['--help'], withEvents([]));

    expect(await result).toMatchObject({ output: stringContaining('Usage: pnpm run logs:deployed'), exitCode: 0 });
    expect(cloudflare.bodies).toEqual([]);
  });
});
