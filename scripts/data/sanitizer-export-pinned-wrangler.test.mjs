import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const packagePath = require.resolve('wrangler/package.json');
const cli = path.join(path.dirname(packagePath), 'wrangler-dist/cli.js');
const databaseId = '11111111-1111-4111-8111-111111111111';
const databaseName = 'synthetic-export157';
const account = 'a'.repeat(32);
const token = 'synthetic-only-export157';
// Include CRLF, a split UTF-8 character, NUL and a non-UTF-8 octet: a text
// conversion, newline normalization or dropped chunk cannot satisfy equality.
const chunks = [[45, 45, 32, 226], [130, 172, 13, 10], [0, 255, 39, 59, 10]];
const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));

// Serialized into a test-only preload. No Wrangler source/exports are replaced.
// The bundled undici@7.14.0 dispatcher protocol and global symbol were inspected
// in the pinned bundle. A closed dispatcher supplies HTTP frames to real fetch;
// socket/DNS/process guards also fail closed if any code bypasses that transport.
const networkHarness = String.raw`async function networkHarness(config) {
  const fs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const audit = entry => fs.appendFileSync(config.audit, JSON.stringify(entry) + '\n');
  const block = name => () => {
    const error = new Error('FIX157_NETWORK_ISOLATED');
    audit({ type: 'blocked', name, stack: error.stack });
    throw error;
  };
  const net = (await import('node:net')).default;
  const tls = (await import('node:tls')).default;
  const dns = (await import('node:dns')).default;
  const http = (await import('node:http')).default;
  const https = (await import('node:https')).default;
  const http2 = (await import('node:http2')).default;
  const dgram = (await import('node:dgram')).default;
  const child = (await import('node:child_process')).default;
  net.Socket.prototype.connect = block('socket');
  net.connect = net.createConnection = block('net');
  tls.connect = block('tls');
  http.request = http.get = block('http');
  https.request = https.get = block('https');
  http2.connect = block('http2');
  dgram.createSocket = block('udp');
  for (const key of Object.keys(dns)) if (key === 'lookup' || key.startsWith('resolve') || key === 'reverse') dns[key] = block('dns');
  for (const key of Object.keys(dns.promises)) if (key === 'lookup' || key.startsWith('resolve') || key === 'reverse') dns.promises[key] = block('dns-promises');
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[key] = block('subprocess');
  syncBuiltinESMExports();
  process.env.CLOUDFLARE_API_BASE_URL = 'https://api.fix157.invalid/client/v4';
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_SEND_ERROR_REPORTS = 'false';
  process.env.WRANGLER_LOG_PATH = config.log;
  process.env.XDG_CONFIG_HOME = config.home;
  process.env.TMPDIR = config.temp;
  // Observe actual adapter writes without changing their behavior.
  const write = fs.writeSync;
  fs.writeSync = (fd, data, ...rest) => {
    const result = write(fd, data, ...rest);
    if (fd === 3) audit({ type: 'fd-write', count: result });
    return result;
  };
  syncBuiltinESMExports();
  const envelope = result => ({ success: true, errors: [], messages: [], result });
  const dispatcher = {
    dispatch(options, handler) {
      const url = new URL(options.path, options.origin);
      const method = options.method;
      let response;
      let download = false;
      let status = 200;
      let aborted = false;
      const fail = error => { if (!aborted) { aborted = true; handler.onError(error); } };
      handler.onConnect(fail, {});
      const run = async () => {
        const headers = Array.isArray(options.headers) ? Object.fromEntries(Array.from({ length: options.headers.length / 2 }, (_, index) => [String(options.headers[index * 2]).toLowerCase(), String(options.headers[index * 2 + 1])])) : Object.fromEntries(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]));
        if (url.origin === 'https://api.fix157.invalid' && headers.authorization !== 'Bearer ' + config.token) throw new Error('Synthetic API authorization not observed.');
        if (url.origin === 'https://download.fix157.invalid' && headers.authorization) throw new Error('API authorization leaked to signed download.');
        let requestBytes = Buffer.alloc(0);
        if (options.body) {
          for await (const chunk of options.body) requestBytes = Buffer.concat([requestBytes, Buffer.from(chunk)]);
        }
        const body = requestBytes.length ? JSON.parse(requestBytes.toString()) : undefined;
        const prefix = '/client/v4/accounts/' + config.account + '/d1/database/';
        if (url.origin === 'https://api.fix157.invalid' && url.pathname === prefix + config.databaseId && method === 'GET') {
          const previous = fs.existsSync(config.audit) ? fs.readFileSync(config.audit, 'utf8').split('\n').filter(line => line.includes('"kind":"identity"')).length : 0;
          response = envelope({ uuid: config.mode === 'identity-mismatch' && previous === 1 ? '22222222-2222-4222-8222-222222222222' : config.databaseId, name: config.databaseName, version: 'beta', file_size: 123 });
          audit({ type: 'request', kind: 'identity', method });
        } else if (url.origin === 'https://api.fix157.invalid' && url.pathname === '/client/v4/graphql' && method === 'POST') {
          if (body.operationName !== 'getD1MetricsOverviewQuery' || body.variables.accountTag !== config.account) throw new Error('Unexpected metrics request.');
          response = { data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [] }] } } };
          audit({ type: 'request', kind: 'metrics', method });
        } else if (url.origin === 'https://api.fix157.invalid' && url.pathname === prefix + config.databaseId + '/export' && method === 'POST') {
          const prior = fs.readFileSync(config.audit, 'utf8').split('\n').filter(line => line.includes('"kind":"export"')).length;
          audit({ type: 'request', kind: 'export', method, body });
          response = envelope(config.mode === 'export-api-failure' ? { success: false, error: 'SYNTHETIC_PRIVATE_EXPORT_ERROR' } : prior === 0 ? { success: true, status: 'active', messages: ['Uploaded part 1'], at_bookmark: 'synthetic-bookmark' } : { success: true, status: 'complete', messages: [], result: { signed_url: 'https://download.fix157.invalid/export.sql' } });
        } else if (url.href === 'https://download.fix157.invalid/export.sql' && method === 'GET') {
          audit({ type: 'request', kind: 'download', method });
          download = true;
          if (config.mode === 'download-http-failure') status = 503;
        } else {
          audit({ type: 'blocked', name: 'unmatched-dispatch' });
          throw new Error('FIX157_NETWORK_ISOLATED');
        }
        if (aborted) return;
        handler.onHeaders(status, [Buffer.from('content-type'), Buffer.from(download ? 'application/octet-stream' : 'application/json')], () => {}, 'Synthetic');
        const data = download ? config.chunks.map(chunk => Buffer.from(chunk)) : [Buffer.from(JSON.stringify(response))];
        for (let index = 0; index < data.length; index++) {
          // Separate turns force real fetch/ReadableStream delivery in chunks.
          await new Promise(resolve => setTimeout(resolve, 10));
          if (aborted) return;
          if (download && config.mode === 'stream-failure' && index === 1) throw new Error('SYNTHETIC_PRIVATE_STREAM_ERROR');
          handler.onData(data[index]);
          if (download) audit({ type: 'download-chunk', index, size: data[index].length });
        }
        if (!aborted) handler.onComplete([]);
      };
      run().catch(fail);
      return true;
    },
  };
  Object.defineProperty(globalThis, Symbol.for('undici.globalDispatcher.1'), { value: dispatcher, writable: false, configurable: false });
  audit({ type: 'guard-ready' });
}`;

function fixture(mode) {
  expect(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version).toBe('4.54.0');
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'tmp/export157-pinned-'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { mode: 0o700 });
  const temp = path.join(dir, 'os-tmp');
  fs.mkdirSync(temp, { mode: 0o700 });
  // Integration finding: update-check@1.5.4 uses os.tmpdir(), not HOME, and
  // fetches npm metadata when its one-hour cache is absent/expired. Seed only
  // this fixture's cache using the inspected vendor format; keep all network
  // blocks active. Cold/expired controls below prove this boundary explicitly.
  if (mode !== 'cold-update-cache') {
    fs.mkdirSync(path.join(temp, 'update-check'));
    fs.writeFileSync(path.join(temp, 'update-check/wrangler-latest.json'), JSON.stringify({ latest: '4.54.0', lastUpdate: mode === 'expired-update-cache' ? 0 : Date.now() }));
  }
  fs.mkdirSync(path.join(dir, 'scripts/data'), { recursive: true });
  for (const name of ['production-identity-bound-command.mjs', 'production-identity-bound-command-lib.mjs', 'sanitizer-export-output-lib.mjs', 'sanitizer-export-provider.mjs', 'workflow-request-context-lib.mjs', 'git-subprocess-env.mjs', 'canary-diagnostics.mjs', 'wrangler-identity-lib.mjs', 'strict-json-lib.mjs']) fs.copyFileSync(path.join(root, 'scripts/data', name), path.join(dir, 'scripts/data', name));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  // Link only the immutable installed package; Wrangler's project cache must
  // remain inside the disposable fixture, never in the shared dependencies.
  fs.symlinkSync(path.dirname(packagePath), path.join(dir, 'node_modules/wrangler'), 'dir');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(dir, 'wrangler.toml'), `name = "synthetic-export157"\ncompatibility_date = "2025-12-01"\nsend_metrics = false\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"\n`);
  const audit = path.join(dir, 'audit.jsonl');
  const guard = path.join(dir, 'network-guard.mjs');
  fs.writeFileSync(guard, `await (${networkHarness})(${JSON.stringify({ mode, audit, home, temp, log: path.join(dir, 'wrangler.log'), databaseId, databaseName, account, token, chunks })});`);
  // The wrapper deliberately strips NODE_OPTIONS. Inject only the network guard
  // into the exact provider subprocess via a test-only parent preload. Runtime
  // source, provider arguments, adapter and the installed CLI remain unchanged.
  const launcher = path.join(dir, 'launch-guard.mjs');
  fs.writeFileSync(launcher, `
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  if (file === 'git' && JSON.stringify(args) === '["rev-parse","HEAD"]') return original(file, args, options);
  if (file !== process.execPath || !args.includes(${JSON.stringify(cli)}) || !args.includes('/dev/fd/3') && !args.includes('info')) throw new Error('Unexpected subprocess.');
  fs.appendFileSync(${JSON.stringify(audit)}, JSON.stringify({ type: 'cli', args: args.slice(args.indexOf(${JSON.stringify(cli)}) + 1), home: options.env.HOME === ${JSON.stringify(home)}, syntheticToken: options.env.CLOUDFLARE_API_TOKEN === ${JSON.stringify(token)}, fd: typeof options.stdio[3] === 'number' }) + '\\n');
  try {
    const result = original(file, ['--import', ${JSON.stringify(pathToFileURL(guard).href)}, ...args], options);
    if (args.includes('info')) fs.appendFileSync(${JSON.stringify(audit)}, JSON.stringify({ type: 'identity-output', value: JSON.parse(result) }) + '\\n');
    return result;
  }
  catch (error) {
    fs.appendFileSync(${JSON.stringify(audit)}, JSON.stringify({ type: 'provider-failure', status: error.status, stderr: String(error.stderr), stdout: String(error.stdout) }) + '\\n');
    throw error;
  }
};
syncBuiltinESMExports();
`);
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout.trim();
  const env = { PATH: process.env.PATH, HOME: home, CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'serpcompany/serplists.com', GITHUB_REF_PROTECTED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', DATA_PROMOTION_WORKFLOW: 'data-promotion', GITHUB_REF: 'refs/heads/main', DATA_PROTECTED_ENVIRONMENT: 'production', GITHUB_SHA: commit, GITHUB_RUN_ID: '157', CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account };
  const output = path.join(dir, 'tmp/production-sensitive/source.sql');
  const evidence = path.join(dir, 'tmp/data-evidence/identity.json');
  return { dir, guard, env, output, evidence,
    events: () => fs.existsSync(audit) ? fs.readFileSync(audit, 'utf8').trim().split('\n').map(JSON.parse) : [],
    run: () => spawnSync(process.execPath, ['--import', launcher, path.join(dir, 'scripts/data/production-identity-bound-command.mjs'), 'sanitizer-export', '--database-name', databaseName, '--database-id', databaseId, '--output', output, '--evidence', evidence], { cwd: dir, env, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 }),
    close: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// This name also matches the existing required data-regression-suite selector;
// ordinary Vitest discovery makes every case mandatory in unit/quality gates.
describe('mandatory actual sanitizer-export CLI with installed-provider double: pinned Wrangler 4.54.0 real exporter, network-only double', () => {
  for (const mode of ['success', 'export-api-failure', 'download-http-failure', 'stream-failure', 'identity-mismatch']) {
    it(`${mode}: executes pinned CLI, identity/metadata/polling and fd3 stream without network`, () => {
      const f = fixture(mode);
      try {
        const result = f.run();
        const events = f.events();
        expect(result.error).toBeUndefined();
        expect(events.filter(event => event.type === 'blocked'), JSON.stringify(events)).toEqual([]);
        expect(events.filter(event => event.type === 'cli').map(event => ({ home: event.home, syntheticToken: event.syntheticToken, fd: event.fd })), JSON.stringify(events)).toEqual(Array(3).fill({ home: true, syntheticToken: true, fd: true }));
        expect(events.filter(event => event.type === 'cli').map(event => event.args)).toEqual([['d1', 'info', databaseName, '--json'], ['d1', 'export', databaseName, '--remote', '--no-schema', '--output', '/dev/fd/3'], ['d1', 'info', databaseName, '--json']]);
        for (const event of events.filter(event => event.type === 'identity-output')) {
          expect(event.value).toMatchObject({ name: databaseName, database_size: 123, read_queries_24h: 0, rows_read_24h: 0 });
          expect(event.value).not.toHaveProperty('file_size');
          expect(event.value).not.toHaveProperty('version');
        }
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain(token);
        expect(result.stderr).not.toContain('SYNTHETIC_PRIVATE');
        const requests = events.filter(event => event.type === 'request');
        expect(requests.map(event => event.kind)).toEqual(['identity', 'metrics', 'export', ...(mode === 'export-api-failure' ? [] : ['export', 'download']), 'identity', 'metrics']);
        const exports = requests.filter(event => event.kind === 'export');
        expect(exports[0].body).toEqual({ output_format: 'polling', dump_options: { no_schema: true, no_data: false, tables: [] } });
        if (exports.length === 2) expect(exports[1].body).toEqual({ ...exports[0].body, current_bookmark: 'synthetic-bookmark' });
        if (mode === 'success') {
          expect(result.status, result.stderr).toBe(0);
          expect(fs.readFileSync(f.output)).toEqual(bytes);
          expect(events.filter(event => event.type === 'fd-write').map(event => event.count)).toEqual(chunks.map(chunk => chunk.length));
          expect(JSON.parse(fs.readFileSync(f.evidence, 'utf8'))).toMatchObject({ verdict: 'pass', before: { databaseId }, after: { databaseId }, operation: 'sanitizer-export' });
          for (const file of [f.output, f.evidence]) expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        } else {
          expect(result.status, result.stderr).toBe(1);
          expect(JSON.parse(result.stderr)).toMatchObject({ verdict: 'fail', cleanup: 'owned-inodes-cleared' });
          expect(fs.readFileSync(f.output).length).toBe(0);
          expect(fs.readFileSync(f.evidence).length).toBe(0);
          if (mode === 'stream-failure') expect(events.filter(event => event.type === 'fd-write').map(event => event.count)).toEqual([chunks[0].length]);
        }
      } finally { f.close(); }
    }, 25000);
  }
  for (const mode of ['cold-update-cache', 'expired-update-cache']) {
    it(`${mode}: identifies and blocks the real vendor registry update attempt`, () => {
      const f = fixture(mode);
      try {
        const result = f.run();
        expect(result.error).toBeUndefined();
        const blocked = f.events().filter(event => event.type === 'blocked');
        expect(blocked).toHaveLength(1);
        expect(blocked[0].name).toBe('https');
        for (const frame of ['loadPackage', 'getMostRecent', 'doUpdateCheck', 'printWranglerBanner']) expect(blocked[0].stack).toContain(frame);
        // Wrangler swallows this optional update error and continues exporting.
        // The ordinary proof's zero-blocked-attempt assertion must still fail.
        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(f.output)).toEqual(bytes);
        expect(() => expect(blocked).toEqual([])).toThrow();
      } finally { f.close(); }
    }, 25000);
  }
  it('hard guard rejects unmatched fetch, raw sockets, DNS and subprocess escape attempts', () => {
    const f = fixture('guard-control');
    try {
      const code = `import net from 'node:net'; import dns from 'node:dns'; import cp from 'node:child_process';
        for (const operation of [() => new net.Socket().connect(443, 'example.com'), () => dns.lookup('example.com', () => {}), () => cp.spawn('curl', ['https://example.com'])]) { try { operation(); throw new Error('guard missed'); } catch (e) { if (e.message !== 'FIX157_NETWORK_ISOLATED') throw e; } }
        try { await fetch('https://example.com/'); throw new Error('guard missed'); } catch (e) { if (e.message === 'guard missed') throw e; }`;
      const result = spawnSync(process.execPath, ['--import', f.guard, '--input-type=module', '-e', code], { cwd: f.dir, env: f.env, encoding: 'utf8', timeout: 5000 });
      expect(result.status, result.stderr).toBe(0);
      expect(f.events().filter(event => event.type === 'blocked').map(event => event.name)).toEqual(['socket', 'dns', 'subprocess', 'unmatched-dispatch']);
    } finally { f.close(); }
  });
});
