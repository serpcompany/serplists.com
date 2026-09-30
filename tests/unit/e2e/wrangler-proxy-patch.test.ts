import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo, Socket } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The browser tests' preview runs `wrangler dev`, whose dev proxy (ProxyWorker) keeps its
// connections to the local worker open. The worker's workerd closes a connection 5 seconds after
// its last response, and while the worker is busy it reads no new request and runs no timer, so a
// request that reached an idle connection in the meantime can lose to that timer: the proxy then
// answers 500 "Network connection lost", and resends only a GET or HEAD
// (cloudflare/workers-sdk#14641, docs/RELIABILITY.md). patches/wrangler@<version>.patch puts a relay
// between the two that sends every request to the worker over a new connection and never closes
// an idle one itself. pnpm applies the patch on install; these checks fail if a wrangler upgrade
// leaves it behind.

type WorkerUrl = { protocol: string; hostname: string; port: string };
type ProxyMessage = { type: string; proxyData?: { userWorkerUrl: WorkerUrl; headers?: Record<string, string> } };
type UserWorkerRelays = { relay(message: ProxyMessage): Promise<ProxyMessage>; close(): Promise<void> };

const require = createRequire(import.meta.url);
const wranglerDir = path.dirname(require.resolve('wrangler/package.json'));
const { version } = JSON.parse(readFileSync(path.join(wranglerDir, 'package.json'), 'utf8')) as { version: string };
const { pnpm } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  pnpm?: { patchedDependencies?: Record<string, string> };
};
const relayModule = path.join(wranglerDir, 'wrangler-dist', 'serplists-user-worker-relay.js');

describe("wrangler's dev proxy patch", () => {
  it('is listed for the installed wrangler version, in an LF patch file that exists', () => {
    const patchFile = pnpm?.patchedDependencies?.[`wrangler@${version}`];
    expect(patchFile, `package.json has no pnpm.patchedDependencies entry for wrangler@${version}`).toBeDefined();
    expect(existsSync(patchFile!), `${patchFile} is missing`).toBe(true);
    expect(readFileSync(patchFile!, 'utf8')).not.toContain('\r');
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
    // Stands in for the worker: echoes what it received, and never closes a connection itself.
    worker = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
        res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, body }));
      });
    });
    worker.keepAliveTimeout = 0;
    worker.on('connection', () => (workerConnections += 1));
    await new Promise<void>((resolve) => worker.listen(0, '127.0.0.1', resolve));
    workerUrl = { protocol: 'http:', hostname: '127.0.0.1', port: String((worker.address() as AddressInfo).port) };
    const { UserWorkerRelays } = require(relayModule) as { UserWorkerRelays: new () => UserWorkerRelays };
    relays = new UserWorkerRelays();
    // Like the proxy's own pool: one connection, kept open between requests.
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
    return message.proxyData!.userWorkerUrl;
  }

  function send(to: WorkerUrl, method: string, pathname: string, body?: string) {
    return new Promise<{ status: number; setCookie: string[]; json: Record<string, string>; socket: Socket }>(
      (resolve, reject) => {
        const req = http.request({ host: to.hostname, port: Number(to.port), method, path: pathname, agent: proxyPool }, (res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => (text += chunk.toString()));
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              setCookie: res.headers['set-cookie'] ?? [],
              json: JSON.parse(text) as Record<string, string>,
              socket: req.socket!,
            }),
          );
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
    // One kept-alive connection from the proxy, a new one to the worker for each request.
    expect(new Set([first.socket, second.socket, third.socket]).size).toBe(1);
    expect(workerConnections).toBe(3);
  });

  it("never closes the proxy's idle connection itself", { timeout: 15_000 }, async () => {
    const relay = await relayUrl();
    const { socket } = await send(relay, 'GET', '/before');
    let closedByRelay = false;
    socket.on('close', () => (closedByRelay = true));

    // A Node server closes a connection once it has been idle for its keepAliveTimeout plus a
    // second (6 seconds by default), which would bring the race back between proxy and relay.
    await new Promise((resolve) => setTimeout(resolve, 6_500));
    const after = await send(relay, 'POST', '/after', 'late');

    expect(closedByRelay).toBe(false);
    expect(after.socket).toBe(socket);
    expect(after.json.body).toBe('late');
  });

  it('reuses one relay per worker, and leaves remote mode and other messages alone', async () => {
    expect(await relayUrl()).toEqual(await relayUrl());
    const remote = { type: 'play', proxyData: { userWorkerUrl: { protocol: 'https:', hostname: 'preview.workers.dev', port: '443' } } };
    expect(await relays.relay(remote)).toEqual(remote);
    expect(await relays.relay({ type: 'pause' })).toEqual({ type: 'pause' });
  });
});
