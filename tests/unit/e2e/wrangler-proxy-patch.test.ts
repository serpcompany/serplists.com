import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { Socket } from 'node:net';
import path from 'node:path';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { listeningPort } from '../../support/listeningPort';
import { parseJsonText } from '../../support/storedJson';

const KEEP_ALIVE_TIMEOUT_DISABLED = 0;
const PAST_A_NODE_SERVERS_DEFAULT_IDLE_CLOSE_MS = 6_500;

const workerUrlSchema = z.object({ protocol: z.string(), hostname: z.string(), port: z.string() }).passthrough();
const proxyMessageSchema = z
  .object({
    type: z.string(),
    proxyData: z.object({ userWorkerUrl: workerUrlSchema, headers: z.record(z.string()).optional() }).passthrough().optional(),
  })
  .passthrough();
const echoedRequest = z.object({ method: z.string(), url: z.string(), host: z.string(), body: z.string() }).passthrough();

type WorkerUrl = z.output<typeof workerUrlSchema>;
type ProxyMessage = z.input<typeof proxyMessageSchema>;
interface UserWorkerRelaysModule {
  relay(message: ProxyMessage): unknown;
  close(): unknown;
}

const require = createRequire(import.meta.url);
const wranglerDir = path.dirname(require.resolve('wrangler/package.json'));
const { version } = parseJsonText(readFileSync(path.join(wranglerDir, 'package.json'), 'utf8'), z.object({ version: z.string() }).passthrough());
const { pnpm } = parseJsonText(
  readFileSync('package.json', 'utf8'),
  z.object({ pnpm: z.object({ patchedDependencies: z.record(z.string()).optional() }).passthrough().optional() }).passthrough(),
);
const relayModule = path.join(wranglerDir, 'wrangler-dist', 'serplists-user-worker-relay.js');

const isUserWorkerRelays = (value: unknown): value is UserWorkerRelaysModule =>
  typeof value === 'object' &&
  value !== null &&
  'relay' in value &&
  typeof value.relay === 'function' &&
  'close' in value &&
  typeof value.close === 'function';

function createUserWorkerRelays() {
  const exported: unknown = require(relayModule);
  const relaysClass = typeof exported === 'object' && exported !== null && 'UserWorkerRelays' in exported ? exported.UserWorkerRelays : undefined;
  if (typeof relaysClass !== 'function') throw new Error(`${relayModule} exports no UserWorkerRelays class`);
  const relays: unknown = Reflect.construct(relaysClass, []);
  if (!isUserWorkerRelays(relays)) throw new Error(`UserWorkerRelays in ${relayModule} has no relay() and close()`);
  return {
    relay: async (message: ProxyMessage) => proxyMessageSchema.parse(await relays.relay(message)),
    close: async () => {
      await relays.close();
    },
  };
}

type UserWorkerRelays = ReturnType<typeof createUserWorkerRelays>;

function createEchoingWorker() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, body }));
    });
  });
}

describe("wrangler's dev proxy patch", () => {
  it('is listed for the installed wrangler version, in an LF patch file that exists', () => {
    const patchFile = pnpm?.patchedDependencies?.[`wrangler@${version}`];
    assert.exists(patchFile, `package.json has no pnpm.patchedDependencies entry for wrangler@${version}`);
    expect(existsSync(patchFile), `${patchFile} is missing`).toBe(true);
    expect(readFileSync(patchFile, 'utf8')).not.toContain('\r');
  });

  it('points the ProxyWorker that wrangler dev runs at the relay, and closes it on teardown', () => {
    expect(existsSync(relayModule), `${relayModule} is missing: the patch is not applied`).toBe(true);
    const cli = readFileSync(path.join(wranglerDir, 'wrangler-dist', 'cli.js'), 'utf8');
    expect(cli).toContain('userWorkerRelays = new (require("./serplists-user-worker-relay.js")).UserWorkerRelays();');
    expect(cli).toContain('const hostMetadata = await this.userWorkerRelays.relay(message);');
    expect(cli).toContain('cf: { hostMetadata }');
    expect(cli).toContain('this.userWorkerRelays.close(),');
  });
});

describe('the relay between the dev proxy and the worker', () => {
  let worker: http.Server;
  let workerUrl: WorkerUrl;
  let workerConnections: number;
  let relays: UserWorkerRelays;
  let proxyPool: http.Agent;

  beforeEach(async () => {
    workerConnections = 0;
    worker = createEchoingWorker();
    worker.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_DISABLED;
    worker.on('connection', () => (workerConnections += 1));
    await new Promise<void>((resolve) => worker.listen(0, '127.0.0.1', resolve));
    workerUrl = { protocol: 'http:', hostname: '127.0.0.1', port: String(listeningPort(worker)) };
    relays = createUserWorkerRelays();
    proxyPool = new http.Agent({ keepAlive: true, maxSockets: 1 });
  });

  afterEach(async () => {
    proxyPool.destroy();
    await relays.close();
    worker.closeAllConnections();
    await new Promise((resolve) => worker.close(resolve));
  });

  async function relayUrl() {
    const message = await relays.relay({ type: 'play', proxyData: { userWorkerUrl: workerUrl, headers: { 'MF-Proxy-Shared-Secret': 's' } } });
    expect(message.proxyData?.headers).toEqual({ 'MF-Proxy-Shared-Secret': 's' });
    assert.exists(message.proxyData);
    return message.proxyData.userWorkerUrl;
  }

  function send(to: WorkerUrl, method: string, pathname: string, body?: string) {
    return new Promise<{ status: number; setCookie: string[]; json: z.output<typeof echoedRequest>; socket: Socket }>(
      (resolve, reject) => {
        const req = http.request({ host: to.hostname, port: Number(to.port), method, path: pathname, agent: proxyPool }, (res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => (text += chunk.toString()));
          res.on('end', () => {
            const { socket } = req;
            if (res.statusCode === undefined || !socket) {
              reject(new Error('The proxy answered without a status or a socket'));
              return;
            }
            resolve({
              status: res.statusCode,
              setCookie: res.headers['set-cookie'] ?? [],
              json: parseJsonText(text, echoedRequest),
              socket,
            });
          });
        });
        req.on('error', reject);
        req.end(body);
      },
    );
  }

  it('sends every request to the worker over a new connection, and answers as the worker did', async () => {
    const relay = await relayUrl();
    expect(relay).not.toEqual(workerUrl);

    const first = await send(relay, 'GET', '/one?x=1');
    const second = await send(relay, 'POST', '/two', 'invite');
    const third = await send(relay, 'DELETE', '/three');

    expect([first.json, second.json, third.json]).toEqual([
      { method: 'GET', url: '/one?x=1', host: `127.0.0.1:${workerUrl.port}`, body: '' },
      { method: 'POST', url: '/two', host: `127.0.0.1:${workerUrl.port}`, body: 'invite' },
      { method: 'DELETE', url: '/three', host: `127.0.0.1:${workerUrl.port}`, body: '' },
    ]);
    expect(second.status).toBe(200);
    expect(second.setCookie).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    const proxySockets = new Set([first.socket, second.socket, third.socket]);
    expect(proxySockets.size).toBe(1);
    expect(workerConnections).toBe(3);
  });

  it("never closes the proxy's idle connection itself, even past a Node server's default idle time", { timeout: 15_000 }, async () => {
    const relay = await relayUrl();
    const { socket } = await send(relay, 'GET', '/before');
    let closedByRelay = false;
    socket.on('close', () => (closedByRelay = true));

    await new Promise((resolve) => setTimeout(resolve, PAST_A_NODE_SERVERS_DEFAULT_IDLE_CLOSE_MS));
    const after = await send(relay, 'POST', '/after', 'late');

    expect(closedByRelay).toBe(false);
    expect(after.socket).toBe(socket);
    expect(after.json.body).toBe('late');
  });

  it("drops the proxy's connection when the worker cannot take a request, as a lost connection to the worker would, so the proxy's own handling of that still applies", async () => {
    const stopped = http.createServer();
    await new Promise<void>((resolve) => stopped.listen(0, '127.0.0.1', resolve));
    const stoppedWorkerUrl = { ...workerUrl, port: String(listeningPort(stopped)) };
    await new Promise((resolve) => stopped.close(resolve));
    const { proxyData } = await relays.relay({ type: 'play', proxyData: { userWorkerUrl: stoppedWorkerUrl } });
    assert.exists(proxyData);
    const relay = proxyData.userWorkerUrl;

    const outcome = await new Promise<number | NodeJS.ErrnoException>((resolve) => {
      const req = http.request({ host: relay.hostname, port: Number(relay.port), method: 'POST', path: '/invite', agent: proxyPool }, (res) => {
        res.resume();
        resolve(res.statusCode ?? new Error('The proxy answered without a status'));
      });
      req.on('error', resolve);
      req.end('invite');
    });

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toMatchObject({ code: 'ECONNRESET' });
  });

  it('reuses one relay per worker, and leaves remote mode and other messages alone', async () => {
    expect(await relayUrl()).toEqual(await relayUrl());
    const remote = { type: 'play', proxyData: { userWorkerUrl: { protocol: 'https:', hostname: 'preview.workers.dev', port: '443' } } };
    expect(await relays.relay(remote)).toEqual(remote);
    expect(await relays.relay({ type: 'pause' })).toEqual({ type: 'pause' });
  });
});
