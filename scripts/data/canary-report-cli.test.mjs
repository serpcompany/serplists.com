import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { safeCanaryFailure } from './canary-diagnostics.mjs';
import yaml from 'js-yaml';

const execute = promisify(execFile);
const commit = 'c'.repeat(40);
const owner = 'OWNER_SENTINEL_111';
const templateId = 'TEMPLATE_SENTINEL_111';
const runId = 'RUN_SENTINEL_111';
const cookie = 'session=SESSION_SENTINEL_111';
const key = 'EVIDENCE_KEY_SENTINEL_111_'.repeat(3);
const sentinels = [owner, templateId, runId, cookie, 'SESSION_SENTINEL_111', key, 'PROVIDER_SECRET_SENTINEL_111', 'STDERR_SENTINEL_111', 'SQL_SENTINEL_111'];
const repoRoot = resolve('.');
const targets = {
  staging: { databaseName: 'serp-checklists-staging-db', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b', deploymentUrl: 'https://staging.serplists-com.pages.dev', customDomain: 'https://staging.serplists.com' },
  production: { databaseName: 'serp-checklists-db', databaseId: 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1', deploymentUrl: 'https://a1b2c3d4.serplists-com.pages.dev', customDomain: 'https://serplists.com' },
};

const databaseRows = [
  { kind: 'template', id: templateId, title: 'Private canary title', version: 3, progress: null, revision: null },
  { kind: 'run', id: runId, title: 'Private run title', version: null, progress: 10, revision: 2 },
];
const successEnvelope = { success: true, meta: { duration: 1, rows_read: 2, rows_written: 0 }, results: databaseRows };

function fixture(failQuery, queryOutput = JSON.stringify([successEnvelope])) {
  const directory = mkdtempSync(join(tmpdir(), 'canary-cli-privacy-'));
  const callsPath = join(directory, 'calls.jsonl');
  const stub = join(directory, 'pnpm');
  writeFileSync(stub, `#!${process.execPath}
const fs = require('node:fs');
const operation = process.argv.includes('info') ? 'info' : 'execute';
fs.appendFileSync(${JSON.stringify(callsPath)}, operation + '\\n');
fs.appendFileSync(${JSON.stringify(join(directory, 'd1.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (operation === 'info') {
  const observations = JSON.parse(fs.readFileSync(${JSON.stringify(join(directory, 'observations.json'))}, 'utf8'));
  const index = fs.readFileSync(${JSON.stringify(callsPath)}, 'utf8').trim().split('\\n').filter(x => x === 'info').length - 1;
  process.stdout.write(observations?.[index] ?? JSON.stringify({
    name: process.argv[6],
    uuid: process.argv[6] === 'serp-checklists-db' ? 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1' : 'fcaf4325-5be7-4ead-ab60-45932a04177b',
  }));
} else if (${JSON.stringify(failQuery)}) {
  process.stderr.write(${JSON.stringify(sentinels.join(' ') + '\n')});
  process.stdout.write(${JSON.stringify(sentinels.join(' ') + '\n')});
  process.exit(27);
} else process.stdout.write(${JSON.stringify(queryOutput)});
`);
  chmodSync(stub, 0o700);
  const preload = join(directory, 'deny-network.mjs');
  writeFileSync(preload, "globalThis.fetch = async () => { throw new Error('Unexpected HTTP transport'); };");
  return { directory, callsPath, preload, reports: join(directory, 'reports') };
}

async function runCli(f, environment, deploymentUrl = targets[environment]?.deploymentUrl, customDomain = targets[environment]?.customDomain, extraArgs = ['--migration-from', 'none', '--migration-to', 'none']) {
  const target = { ...(targets[environment] ?? targets.staging), ...f.target };
  const args = [...extraArgs, '--environment', environment, '--binding', 'DB', '--database-name', target.databaseName, '--database-id', target.databaseId, '--deployment-url', deploymentUrl ?? targets.staging.deploymentUrl, '--custom-domain', customDomain ?? targets.staging.customDomain, '--report-dir', f.reports];
  writeFileSync(join(f.directory, 'observations.json'), JSON.stringify(f.observations ?? null));
  const configurationPreload = [];
  if (f.configuration) {
    const file = join(f.directory, 'configuration.mjs');
    writeFileSync(file, `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const overrides = ${JSON.stringify(f.configuration)};
      const read = fs.readFileSync;
      fs.readFileSync = (file, ...args) => Object.hasOwn(overrides, String(file)) ? overrides[String(file)] : read(file, ...args);
      syncBuiltinESMExports();
    `);
    configurationPreload.push('--import', file);
  }
  try {
    const result = await execute(process.execPath, [...configurationPreload, '--import', f.preload, 'scripts/data/deployment-smoke.mjs', ...(f.args ? f.args(args) : args)], {
      cwd: repoRoot,
      env: { PATH: `${f.directory}:${process.env.PATH}`, HOME: process.env.HOME, CI: '1', GITHUB_SHA: commit, DATA_CANARY_OWNER_ID: owner, DATA_CANARY_TEMPLATE_ID: templateId, DATA_CANARY_RUN_ID: runId, DATA_CANARY_COOKIE: cookie, DATA_CANARY_EVIDENCE_HMAC_KEY: key, DATA_CANARY_MUTATION_APPROVED: 'true', CLOUDFLARE_API_TOKEN: 'PROVIDER_SECRET_SENTINEL_111' },
      encoding: 'utf8', timeout: 20_000,
    });
    return { ...result, code: 0 };
  } catch (error) { return { stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.code }; }
}

function artifacts(f, environment) {
  return Object.fromEntries(['json', 'junit.xml', 'md', 'txt'].map(extension => [extension, readFileSync(join(f.reports, `${environment}-postdeploy-smoke.${extension}`), 'utf8')]));
}

describe.skipIf(process.platform === 'win32')('actual canary CLI privacy and report outcomes', () => {
  it.each(['staging', 'production'])('redacts query argv/stdout/stderr after successful %s identity checks', async environment => {
    const f = fixture(true);
    try {
      const result = await runCli(f, environment);
      expect(result.code).toBe(1);
      expect(readFileSync(f.callsPath, 'utf8').trim().split('\n')).toEqual(environment === 'production' ? ['info', 'execute', 'info'] : ['info', 'execute']);
      const files = artifacts(f, environment);
      for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of sentinels) expect(text).not.toContain(sentinel);
      const report = JSON.parse(files.json);
      expect(report).toMatchObject({ verdict: 'fail', commit, target: { environment, databaseName: targets[environment].databaseName, databaseId: targets[environment].databaseId }, failedStage: 'd1-query', errorCode: 'CANARY_SUBPROCESS_FAILED', exitStatus: 27 });
      for (const text of [...Object.values(files), result.stderr]) for (const context of [commit, environment, targets[environment].databaseName, targets[environment].databaseId]) expect(text).toContain(context);
      expect(files['junit.xml']).toMatch(/failures="[1-9][0-9]*"/);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });

  it.each([200, 500])('reports fake-fetch custom-domain status %s consistently with canary restoration', async healthStatus => {
    const f = await fakeFetchFixture(healthStatus === 200 ? 'ok' : 'customHealth500');
    try {
      const result = await runCli(f, 'staging');
      expect(result.code).toBe(healthStatus === 200 ? 0 : 1);
      const state = JSON.parse(readFileSync(f.statePath, 'utf8'));
      expect(state.template).toMatchObject({title: 'Private canary title', version: healthStatus === 200 ? 5 : 3});
      expect(state.run).toMatchObject({progress: 10, revision: healthStatus === 200 ? 4 : 2});
      const files = artifacts(f, 'staging');
      const report = JSON.parse(files.json);
      expect(report.checks.every(check => check.verdict === 'pass')).toBe(healthStatus === 200);
      expect(report.verdict).toBe(healthStatus === 200 ? 'pass' : 'fail');
      expect(report.evidenceChecks).toContainEqual({ name: 'custom_domain_health', verdict: report.verdict });
      expect(files['junit.xml']).toMatch(healthStatus === 200 ? /failures="0"/ : /failures="[1-9][0-9]*"/);
      expect(files['junit.xml']).toContain('name="custom_domain_health"');
      for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of [...sentinels, 'Private canary title']) expect(text).not.toContain(sentinel);
    } finally {
      rmSync(f.directory, { recursive: true, force: true });
    }
  });

  it.each([200, 401])('names authenticated visibility failure for fake-fetch status %s with missing owned rows', async templateStatus => {
    const f = await fakeFetchFixture('missing' + templateStatus);
    try {
      const result = await runCli(f, 'staging');
      expect(result.code).toBe(1);
      expect(JSON.parse(readFileSync(f.httpCalls, 'utf8')).filter(call => call.startsWith('PUT '))).toEqual([]);
      const files = artifacts(f, 'staging');
      expect(JSON.parse(files.json).checks).toContainEqual({ name: 'authenticated_canary_visibility', verdict: 'fail' });
      expect(files['junit.xml']).toContain('name="authenticated_canary_visibility"');
      expect(files['junit.xml']).toMatch(/failures="[1-9][0-9]*"/);
      for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of sentinels) expect(text).not.toContain(sentinel);
    } finally {
      rmSync(f.directory, { recursive: true, force: true });
    }
  });
});

it('does not trust error-owned diagnostic fields or arbitrary stage strings', () => {
  const error = Object.assign(new Error('SECRET'), { canaryFailure: { message: 'SECRET' }, status: 'SECRET' });
  expect(JSON.stringify(safeCanaryFailure('SECRET', error))).not.toContain('SECRET');
});

async function fakeFetchFixture(mode, queryOutput) {
  const f = fixture(false, queryOutput);
  f.preload = join(f.directory, 'transport.mjs');
  f.httpCalls = join(f.directory, 'http.json');
  f.httpRequests = join(f.directory, 'requests.json');
  f.statePath = join(f.directory, 'state.json');
  writeFileSync(f.preload, `
    import { writeFileSync } from 'node:fs';
    import assert from 'node:assert/strict';
    const mode = ${JSON.stringify(mode)};
    const state = { template: { id: ${JSON.stringify(templateId)}, user_id: ${JSON.stringify(owner)}, title: 'Private canary title', version: 3 }, run: { id: ${JSON.stringify(runId)}, user_id: ${JSON.stringify(owner)}, progress: 10, revision: 2 } };
    process.on('exit', () => writeFileSync(${JSON.stringify(f.statePath)}, JSON.stringify(state)));
    const calls = []; const requests = []; let mutations = 0;
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url).pathname;
      const method = init.method ?? 'GET';
      requests.push({ url: String(url), method, redirect: init.redirect, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
      writeFileSync(${JSON.stringify(f.httpRequests)}, JSON.stringify(requests));
      calls.push(method + ' ' + path); writeFileSync(${JSON.stringify(f.httpCalls)}, JSON.stringify(calls));
      if (mode === 'transport' && path === '/api/templates') throw new Error('SESSION_SENTINEL_111');
      if (path === '/api/templates' && mode.startsWith('missing')) return { status: Number(mode.slice(7)), json: async () => [] };
      if (path === '/api/health') return { status: mode === 'health500' || (mode === 'customHealth500' && new URL(url).hostname === 'staging.serplists.com') ? 500 : 200, json: async () => ({}) };
      if (path === '/api/templates' || path === '/api/checklists') return { status: mode === 'api500' ? 500 : 200, json: async () => [path.includes('templates') ? {...state.template} : {...state.run}] };
      const row = path.includes('templates') ? state.template : state.run;
      if (method === 'PUT') {
        mutations++;
        if (mode === 'write500' && mutations === 1) return { status: 500, json: async () => ({}) };
        if (mode === 'cleanup500' && mutations === 3) return { status: 500, json: async () => ({}) };
        const input = JSON.parse(init.body);
        assert.equal(input[row === state.template ? 'expected_version' : 'expected_revision'], row === state.template ? row.version : row.revision);
        if (row === state.template) { row.title = input.title; row.version++; } else { row.progress = input.progress; row.revision++; }
      }
      const probeRead = method === 'GET' && calls.filter(c => c === 'GET ' + path).length === 1;
      if (probeRead && mode === 'readThrow') throw new Error('SESSION_SENTINEL_111');
      return { status: probeRead && mode === 'read500' ? 500 : 200, json: async () => ({...row, ...(probeRead && mode === 'wrongRead' ? {title: 'wrong', progress: 99} : {})}) };
    };
  `);
  return f;
}

async function loopbackHttpFixture({ healthStatus = 200, templateStatus = 200, missingOwnedRows = false, malformedJson = false } = {}) {
  const f = fixture(false);
  const state = {
    template: { id: templateId, user_id: owner, title: 'Private canary title', version: 3 },
    run: { id: runId, user_id: owner, progress: 10, revision: 2 },
  };
  const requests = [];
  const errors = [];
  const servers = [];
  const close = async () => {
    await Promise.all(servers.map(server => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })));
    rmSync(f.directory, { recursive: true, force: true });
  };
  const listen = async surface => {
    const server = createServer(async (req, res) => {
      try {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = body ? JSON.parse(body) : undefined;
        requests.push({ surface, method: req.method, path: req.url, headers: req.headers, body: input });
        const json = (status, value) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(value));
        };
        if (req.method === 'GET' && req.url === '/api/health') {
          res.writeHead(surface === 'custom' ? healthStatus : 200, { 'content-type': 'text/plain' });
          res.end(surface === 'custom' && healthStatus === 500 ? sentinels.join(' ') : 'healthy');
          return;
        }
        if (surface === 'custom') throw new Error('Unexpected custom-domain request');
        if (req.method === 'GET' && req.url === '/api/templates') {
          if (malformedJson) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{' + sentinels.join(' '));
          } else json(templateStatus, missingOwnedRows ? (templateStatus === 401 ? { error: sentinels.join(' ') } : []) : [state.template]);
          return;
        }
        if (req.method === 'GET' && req.url === '/api/checklists') { json(200, [state.run]); return; }
        const row = req.url === '/api/templates/' + templateId ? state.template
          : req.url === '/api/checklists/' + runId ? state.run : null;
        if (!row || !['GET', 'PUT'].includes(req.method)) throw new Error('Unexpected API request');
        if (req.method === 'PUT') {
          const isTemplate = row === state.template;
          const counter = isTemplate ? 'version' : 'revision';
          const expected = isTemplate ? 'expected_version' : 'expected_revision';
          if (input[expected] !== row[counter]) { json(409, { error: 'Optimistic counter mismatch' }); return; }
          if (isTemplate) row.title = input.title; else row.progress = input.progress;
          row[counter]++;
        }
        json(200, row);
      } catch (error) {
        errors.push(error.message);
        res.writeHead(500); res.end('Test server failure');
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  };
  try {
    const api = await listen('deployment');
    const custom = await listen('custom');
    f.preload = join(f.directory, 'loopback-http.mjs');
    writeFileSync(f.preload, `
      const originalFetch = globalThis.fetch;
      const origins = new Map(${JSON.stringify([[targets.staging.deploymentUrl, api], [targets.staging.customDomain, custom]])});
      globalThis.fetch = (input, init = {}) => {
        const url = new URL(input);
        const destination = origins.get(url.origin);
        if (!destination || url.username || url.password) throw new Error('Unmapped HTTP test origin');
        // Require the CLI's redirect policy instead of silently correcting it:
        // original fetch must never follow a redirect beyond owned loopback.
        if (init.redirect !== 'error') throw new Error('HTTP test requires redirect rejection');
        const mapped = new URL(destination);
        mapped.pathname = url.pathname; mapped.search = url.search;
        return originalFetch(mapped, init);
      };
    `);
    return { ...f, state, requests, errors, close };
  } catch (error) { await close(); throw error; }
}

describe('supplemental153 actual CLI over owned loopback HTTP sockets', () => {
  it.each([
    ['healthy restoration', {}, 'pass'],
    ['custom health 500', { healthStatus: 500 }, 'fail'],
    ['owned rows missing with 200', { missingOwnedRows: true }, 'fail'],
    ['owned rows missing with 401', { missingOwnedRows: true, templateStatus: 401 }, 'fail'],
    ['malformed JSON with 200', { malformedJson: true }, 'fail'],
  ])('%s preserves wire requests, counters and private reports', async (_name, options, verdict) => {
    const f = await loopbackHttpFixture(options);
    try {
      const result = await runCli(f, 'staging');
      expect(result.code).toBe(verdict === 'pass' ? 0 : 1);
      expect(f.errors).toEqual([]);
      expect(readFileSync(f.callsPath, 'utf8').trim().split('\n')).toEqual(['info', 'execute', 'info']);
      const trace = f.requests.map(({surface, method, path}) => `${surface} ${method} ${path}`);
      // The four initial reads run concurrently across two real servers.
      expect(trace.slice(0, 4).sort()).toEqual([
        'custom GET /api/health', 'deployment GET /api/checklists',
        'deployment GET /api/health', 'deployment GET /api/templates',
      ]);
      const t = 'deployment /api/templates/' + templateId;
      const r = 'deployment /api/checklists/' + runId;
      const operation = (method, target) => target.replace('deployment ', 'deployment ' + method + ' ');
      expect(trace.slice(4)).toEqual(verdict === 'pass' ? [
        operation('PUT', t), operation('GET', t), operation('PUT', r), operation('GET', r),
        operation('GET', t), operation('PUT', t), operation('GET', t),
        operation('GET', r), operation('PUT', r), operation('GET', r),
      ] : []);
      expect(f.requests.filter(request => request.method === 'PUT').map(request => request.body)).toEqual(verdict === 'pass' ? [
        { title: 'Private canary title [write probe]', expected_version: 3 },
        { progress: 42, expected_revision: 2 },
        { title: 'Private canary title', expected_version: 4 },
        { progress: 10, expected_revision: 3 },
      ] : []);
      expect(f.state.template).toEqual({id: templateId, user_id: owner, title: 'Private canary title', version: verdict === 'pass' ? 5 : 3});
      expect(f.state.run).toEqual({id: runId, user_id: owner, progress: 10, revision: verdict === 'pass' ? 4 : 2});
      for (const request of f.requests) {
        expect(request.headers.host).toMatch(/^127\.0\.0\.1:\d+$/);
        if (request.path === '/api/health') expect(request.headers.cookie).toBeUndefined();
        else {
          expect(request.headers.cookie).toBe(cookie);
          expect(request.headers.accept).toBe('application/json');
          expect(request.headers['content-type']).toBe('application/json');
        }
      }
      const files = artifacts(f, 'staging'); const report = JSON.parse(files.json);
      expect(report).toMatchObject({verdict, commit, target: {environment: 'staging', binding: 'DB', databaseName: targets.staging.databaseName, databaseId: targets.staging.databaseId}, migrationRange: {from: null, to: null}});
      if (options.missingOwnedRows || options.malformedJson) {
        expect(report).toMatchObject({failedStage: 'canary-records', checks: [{name: 'authenticated_canary_visibility', verdict: 'fail'}]});
        expect(files['junit.xml']).toContain('name="authenticated_canary_visibility"');
      } else {
        expect(report).toMatchObject({deploymentUrl: targets.staging.deploymentUrl, customDomain: targets.staging.customDomain, deploymentHealthStatus: 200, customDomainHealthStatus: options.healthStatus ?? 200});
        expect(report.evidenceChecks).toContainEqual({name: 'custom_domain_health', verdict});
        expect(report.checks.every(check => check.verdict === 'pass')).toBe(verdict === 'pass');
        expect(files['junit.xml']).toContain('name="custom_domain_health"');
      }
      expect(files['junit.xml']).toMatch(verdict === 'pass' ? /failures="0"/ : /failures="[1-9][0-9]*"/);
      for (const text of [...Object.values(files), result.stdout, result.stderr]) {
        for (const sentinel of [...sentinels, 'Private canary title', '127.0.0.1']) expect(text).not.toContain(sentinel);
      }
    } finally { await f.close(); }
  });

  it('preload refuses every origin outside its exact two-origin map before a socket request', async () => {
    const f = await loopbackHttpFixture();
    try {
      const script = `
        import assert from 'node:assert/strict';
        for (const origin of ['https://unmapped.invalid', 'https://serplists.com', 'http://127.0.0.1:1', 'https://staging.serplists-com.pages.dev.evil.invalid']) {
          assert.throws(() => fetch(origin, {redirect: 'error'}), /Unmapped HTTP test origin/);
        }
        assert.throws(() => fetch(${JSON.stringify(targets.staging.deploymentUrl)}), /redirect rejection/);
      `;
      await execute(process.execPath, ['--import', f.preload, '--input-type=module', '--eval', script], {env: {PATH: f.directory}, timeout: 5000});
      expect(f.requests).toEqual([]);
    } finally { await f.close(); }
  });
});

const invalidD1Outputs = [
  ['failed with valid rows', [{ ...successEnvelope, success: false, error: sentinels.join(' ') }]],
  ...[false, null, 'true', 1, undefined].map(success => ['invalid success ' + success, [{ ...successEnvelope, success }]]),
  ...[null, '', sentinels.join(' ')].map(error => ['contradictory error ' + typeof error, [{ ...successEnvelope, error }]]),
  ...[null, {}, 'failure', [sentinels.join(' ')]].map(errors => ['invalid errors ' + JSON.stringify(errors), [{ ...successEnvelope, errors }]]),
  ...[undefined, null, [], 'meta'].map(meta => ['invalid meta ' + meta, [{ ...successEnvelope, meta }]]),
  ...[undefined, null, {}, 'rows'].map(results => ['invalid results ' + results, [{ ...successEnvelope, results }]]),
  ...[null, [], {}, true].map(output => ['invalid root ' + JSON.stringify(output), output]),
  ['trailing failed envelope', [successEnvelope, { success: false, error: sentinels.join(' ') }]],
  ['leading failed envelope', [{ success: false }, successEnvelope]],
  ['extra successful set', [successEnvelope, { ...successEnvelope, results: [] }]],
  ['split statement rows', databaseRows.map(row => ({ ...successEnvelope, results: [row] }))],
  ...[null, [], 'row', {}, { ...databaseRows[0], kind: 'unknown' }, { ...databaseRows[0], id: 1 },
    { ...databaseRows[0], id: 'not-designated' }, { ...databaseRows[0], title: null },
    { ...databaseRows[0], version: '3' }, { ...databaseRows[0], version: -1 },
    { ...databaseRows[1], revision: 1.5 }, { ...databaseRows[1], progress: '10' },
    { ...databaseRows[1], progress: 101 }, { ...databaseRows[1], version: 3 },
  ].map(row => ['malformed row ' + JSON.stringify(row), [{ ...successEnvelope, results: row?.kind === 'run' ? [databaseRows[0], row] : [row, databaseRows[1]] }]]),
  ['duplicate template', [{ ...successEnvelope, results: [...databaseRows, databaseRows[0]] }]],
  ['missing run', [{ ...successEnvelope, results: [databaseRows[0]] }]],
  ['empty rows', [{ ...successEnvelope, results: [] }]],
  ...Object.keys(databaseRows[0]).map(column => ['missing column ' + column, [{ ...successEnvelope, results: [{ ...databaseRows[0], [column]: undefined }, databaseRows[1]] }]]),
  ['extra column', [{ ...successEnvelope, results: [{ ...databaseRows[0], unexpected: 'private' }, databaseRows[1]] }]],
  ['unsafe version', [{ ...successEnvelope, results: [{ ...databaseRows[0], version: Number.MAX_SAFE_INTEGER + 1 }, databaseRows[1]] }]],
].map(([name, output]) => [name, JSON.stringify(output)]);
invalidD1Outputs.push(
  ['invalid JSON', '{' + sentinels.join(' ')],
  ['duplicate success keys', JSON.stringify([successEnvelope]).replace('"success":true', '"success":false,"success":true')],
  ['production failed envelope', JSON.stringify([{ ...successEnvelope, success: false, errors: [sentinels.join(' ')] }]), 'production'],
);

it.each(invalidD1Outputs)('actual CLI rejects D1 prerequisite: %s', async (_name, output, environment = 'staging') => {
  const f = await fakeFetchFixture('ok', output);
  try {
    const result = await runCli(f, environment, undefined, undefined);
    const calls = existsSync(f.httpCalls) ? JSON.parse(readFileSync(f.httpCalls, 'utf8')) : [];
    expect.soft(calls.filter(call => !call.startsWith('GET '))).toEqual([]);
    expect.soft(calls).toEqual([]);
    expect.soft(result.code).toBe(1);
    const files = artifacts(f, environment);
    expect.soft(JSON.parse(files.json)).toMatchObject({ verdict: 'fail', commit, target: { environment, binding: 'DB', databaseName: targets[environment].databaseName, databaseId: targets[environment].databaseId }, migrationRange: { from: null, to: null }, failedStage: 'database-result', checks: [{ name: 'canary_database_result', verdict: 'fail' }] });
    expect.soft(files['junit.xml']).toMatch(/failures="[1-9][0-9]*"/);
    for (const text of [files.md, files.txt, result.stderr]) expect.soft(text).toContain(`BLOCKED ${environment} postdeploy smoke at database-result`);
    for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of [...sentinels, 'Private canary title']) expect(text).not.toContain(sentinel);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

it.each(['staging', 'production'])('actual CLI accepts a complete single-object D1 envelope in %s', async environment => {
  const f = await fakeFetchFixture('ok', JSON.stringify({ ...successEnvelope, errors: [] }));
  try {
    const result = await runCli(f, environment, undefined, undefined);
    expect(result.code).toBe(0);
    expect(JSON.parse(artifacts(f, environment).json).verdict).toBe('pass');
    expect(JSON.parse(readFileSync(f.httpCalls, 'utf8')).filter(call => call.startsWith('PUT '))).toHaveLength(4);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

it.each(['ok', 'health500', 'api500', 'write500', 'read500', 'wrongRead', 'readThrow', 'transport', 'cleanup500'])('actual CLI fake transport stops safely for %s', async mode => {
  const f = await fakeFetchFixture(mode);
  try {
    const result = await runCli(f, 'staging', undefined, undefined);
    expect(result.code).toBe(mode === 'ok' ? 0 : 1);
    const calls = JSON.parse(readFileSync(f.httpCalls, 'utf8'));
    expect(calls.slice(0, 4)).toEqual(['GET /api/templates', 'GET /api/checklists', 'GET /api/health', 'GET /api/health']);
    const t = '/api/templates/' + templateId; const r = '/api/checklists/' + runId;
    if (mode === 'ok') expect(calls.slice(4)).toEqual(['PUT ' + t, 'GET ' + t, 'PUT ' + r, 'GET ' + r, 'GET ' + t, 'PUT ' + t, 'GET ' + t, 'GET ' + r, 'PUT ' + r, 'GET ' + r]);
    if (mode === 'write500') expect(calls.slice(4)).toEqual(['PUT ' + t, 'GET ' + t, 'GET ' + t]);
    if (['read500', 'wrongRead', 'readThrow'].includes(mode)) expect(calls.slice(4)).toEqual(['PUT ' + t, 'GET ' + t, 'GET ' + t, 'PUT ' + t, 'GET ' + t]);
    const writes = calls.filter(c => c.startsWith('PUT'));
    if (['health500', 'api500', 'transport'].includes(mode)) expect(writes).toEqual([]);
    if (['write500', 'read500', 'wrongRead', 'readThrow'].includes(mode)) expect(writes.every(c => c.includes('/templates/'))).toBe(true);
    const files = artifacts(f, 'staging');
    const report = JSON.parse(files.json);
    expect(report.verdict).toBe(mode === 'ok' ? 'pass' : 'fail');
    expect(report.target.binding).toBe('DB');
    expect(report.migrationRange).toEqual({from: null, to: null});
    for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of [...sentinels, 'Private canary title']) expect(text).not.toContain(sentinel);
    expect(files['junit.xml']).toMatch(mode === 'ok' ? /failures="0"/ : /failures="[1-9][0-9]*"/);
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each([
  [], ['--migration-from', 'none'], ['--migration-to', 'none'],
  ['--migration-from', 'none', '--migration-to', '0024_safe_template_evolution.sql'],
  ['--migration-from', '0024_safe_template_evolution.sql', '--migration-to', '0023_previous.sql'],
].map(args => [args]))('rejects incomplete or invalid reviewed migration arguments %j before transport', async args => {
  const f = await fakeFetchFixture('ok');
  try {
    const result = await runCli(f, 'staging', undefined, undefined, args);
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, 'staging').json).migrationRange).toEqual({from: 'invalid', to: 'invalid'});
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it('preserves the exact reviewed named migration pair in CLI reports', async () => {
  const f = await fakeFetchFixture('ok');
  try {
    const from = '0023_previous.sql'; const to = '0024_safe_template_evolution.sql';
    const result = await runCli(f, 'staging', undefined, undefined, ['--migration-from', from, '--migration-to', to]);
    expect(result.code).toBe(0);
    const files = artifacts(f, 'staging');
    expect(JSON.parse(files.json).migrationRange).toEqual({from, to});
    for (const text of Object.values(files)) { expect(text).toContain(from); expect(text).toContain(to); }
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it('bounded153 rejects staging labeled production identity and destinations before any transport', async () => {
  const f = await fakeFetchFixture('ok');
  f.target = targets.production;
  try {
    const result = await runCli(f, 'staging', 'https://serplists.com', 'https://serplists.com');
    expect.soft(result.code).toBe(1);
    expect.soft(existsSync(f.callsPath)).toBe(false);
    expect.soft(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, 'staging').json)).toMatchObject({ verdict: 'fail', failedStage: 'configuration' });
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

const invalidDestinations = [
  ['staging', 'https://serplists.com', undefined],
  ['staging', undefined, 'https://serplists.com'],
  ['staging', 'https://serplists-com.pages.dev', undefined],
  ['staging', 'https://a1b2c3d4.serplists-com.pages.dev', undefined],
  ['production', 'https://staging.serplists-com.pages.dev', undefined],
  ['production', undefined, 'https://staging.serplists.com'],
  ['production', 'https://feature.serplists-com.pages.dev', undefined],
  ...['http://staging.serplists-com.pages.dev', '//staging.serplists-com.pages.dev',
    'https:staging.serplists-com.pages.dev', 'https:///staging.serplists-com.pages.dev',
    'https://SESSION_SENTINEL_111@staging.serplists-com.pages.dev',
    'https://staging.serplists-com.pages.dev.evil.invalid',
    'https://evil.invalid/staging.serplists-com.pages.dev',
    'https://staging.serplists-com.pages.dev:8443', 'https://staging.serplists-com.pages.dev:443',
    'https://staging.serplists-com.pages.dev.', 'https://staging.serplists-com.pages.dev/path',
    'https://staging.serplists-com.pages.dev?secret=SESSION_SENTINEL_111',
    'https://staging.serplists-com.pages.dev#fragment', ' https://staging.serplists-com.pages.dev',
    'https://staging.serplists-com.pages.dev\n', 'https://staging%2eserplists-com.pages.dev',
    'https://STAGING.serplists-com.pages.dev', 'file:///tmp/canary', 'http://127.0.0.1:1',
  ].map(url => ['staging', url, undefined]),
  ['production', 'https://a1b2c3d4.other-project.pages.dev', undefined],
  ['production', 'https://a1b2c3d4.serplists-com.pages.dev.evil.invalid', undefined],
];

const observedStaging = { name: targets.staging.databaseName, uuid: targets.staging.databaseId };
const ambiguousObservations = [
  JSON.stringify([observedStaging, { name: targets.production.databaseName, uuid: targets.production.databaseId }]),
  JSON.stringify({ ...observedStaging, database_name: targets.production.databaseName }),
  JSON.stringify({ ...observedStaging, database_id: targets.production.databaseId }),
  JSON.stringify(observedStaging).replace('"uuid":', '"uuid":"wrong","uuid":'),
  JSON.stringify({ ...observedStaging, success: false }),
];

it.each(['staging', 'production'].flatMap(environment => ambiguousObservations.flatMap(stagingOutput => {
  const output = environment === 'staging' ? stagingOutput : stagingOutput
    .replaceAll(targets.production.databaseName, 'OTHER_NAME').replaceAll(targets.production.databaseId, 'OTHER_ID')
    .replaceAll(targets.staging.databaseName, targets.production.databaseName).replaceAll(targets.staging.databaseId, targets.production.databaseId)
    .replaceAll('OTHER_NAME', targets.staging.databaseName).replaceAll('OTHER_ID', targets.staging.databaseId);
  return [[environment, output, 0], [environment, output, 1]];
})))('bounded153 rejects ambiguous adjacent %s identity %s at %s', async (environment, output, index) => {
  const f = await fakeFetchFixture('ok');
  const expected = JSON.stringify({name: targets[environment].databaseName, uuid: targets[environment].databaseId});
  f.observations = [expected, expected];
  f.observations[index] = output;
  try {
    const result = await runCli(f, environment);
    expect.soft(result.code).toBe(1);
    expect.soft(readFileSync(f.callsPath, 'utf8').trim().split('\n')).toEqual(index === 0 ? ['info'] : ['info', 'execute', 'info']);
    expect.soft(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, environment).json)).toMatchObject({ verdict: 'fail', failedStage: 'identity' });
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each(invalidDestinations)('bounded153 rejects destination %s %s %s before transport', async (environment, deploymentUrl, customDomain) => {
  const f = await fakeFetchFixture('ok');
  try {
    const result = await runCli(f, environment, deploymentUrl, customDomain);
    expect.soft(result.code).toBe(1);
    expect.soft(existsSync(f.callsPath)).toBe(false);
    expect.soft(existsSync(f.httpCalls)).toBe(false);
    const files = artifacts(f, environment);
    expect(JSON.parse(files.json)).toMatchObject({ verdict: 'fail', failedStage: 'configuration' });
    for (const text of [...Object.values(files), result.stdout, result.stderr]) expect(text).not.toContain('SESSION_SENTINEL_111');
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each([
  'http://staging.serplists.com', 'https:staging.serplists.com', 'https:///staging.serplists.com',
  'https://SESSION_SENTINEL_111@staging.serplists.com', 'https://staging.serplists.com:443',
  'https://staging.serplists.com.evil.invalid', 'https://staging.serplists.com/path',
  'https://staging.serplists.com?SESSION_SENTINEL_111', 'https://staging.serplists.com#fragment',
  'https://staging.serplists.com.', 'https://staging%2eserplists.com', 'https://staging.serplists.com\\evil',
])('bounded153 rejects malformed custom-domain %s before transport', async customDomain => {
  const f = await fakeFetchFixture('ok');
  try {
    const result = await runCli(f, 'staging', undefined, customDomain);
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, 'staging').json)).toMatchObject({verdict: 'fail', failedStage: 'configuration'});
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each([
  ['local', {}], ['preview', {}], ['rehearsal', {}], ['unknown', {}],
  ['staging', { databaseName: targets.production.databaseName }],
  ['staging', { databaseId: targets.production.databaseId }],
  ['staging', { databaseName: 'unknown' }],
  ['production', { databaseName: targets.staging.databaseName }],
  ['production', { databaseId: targets.staging.databaseId }],
  ['production', { databaseId: 'not-a-uuid' }],
])('bounded153 rejects target %s %j before transport', async (environment, target) => {
  const f = await fakeFetchFixture('ok'); f.target = target;
  try {
    const result = await runCli(f, environment);
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, ['staging', 'production'].includes(environment) ? environment : 'unknown').json)).toMatchObject({ verdict: 'fail', failedStage: 'configuration' });
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each([
  ...['--environment', '--binding', '--database-name', '--database-id', '--deployment-url', '--custom-domain'].flatMap(option => [
    ['missing ' + option, args => { const i = args.indexOf(option); return args.toSpliced(i, 2); }],
    ['duplicate ' + option, args => [...args, option, args[args.indexOf(option) + 1]]],
    ['equals ' + option, args => { const i = args.indexOf(option); return args.toSpliced(i, 2, option + '=' + args[i + 1]); }],
  ]),
  ['wrong binding', args => args.map(value => value === 'DB' ? 'OTHER' : value)],
  ...['--local', '--remote', '--preview', '--env', '--unknown'].map(flag => [flag, args => [...args, flag]]),
  ['two separators', args => ['--', '--', ...args]],
])('bounded153 rejects ambiguous arguments %s before transport', async (_name, args) => {
  const f = await fakeFetchFixture('ok'); f.args = args;
  try {
    const result = await runCli(f, 'staging');
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each([
  ['staging', 'https://staging.serplists-com.pages.dev'],
  ['production', 'https://a1b2c3d4.serplists-com.pages.dev'],
  ['production', 'https://01234567.serplists-com.pages.dev/'],
  ['production', 'https://serplists-com.pages.dev'],
  ['production', 'https://main.serplists-com.pages.dev'],
])('bounded153 preserves exact healthy %s requests and reports for %s', async (environment, deploymentUrl) => {
  const f = await fakeFetchFixture('ok');
  f.args = args => ['--', ...args];
  try {
    const result = await runCli(f, environment, deploymentUrl, targets[environment].customDomain + '/');
    expect(result.code).toBe(0);
    expect(readFileSync(f.callsPath, 'utf8').trim().split('\n')).toEqual(['info', 'execute', 'info']);
    const name = targets[environment].databaseName;
    expect(readFileSync(join(f.directory, 'd1.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ['exec', 'wrangler', 'd1', 'info', name, '--json'],
      ['exec', 'wrangler', 'd1', 'execute', name, '--remote', '--json', '--command', `SELECT 'template' AS kind, id, title, version, NULL AS progress, NULL AS revision FROM templates WHERE id='${templateId}' AND user_id='${owner}' AND deleted_at IS NULL UNION ALL SELECT 'run', id, title, NULL, progress, revision FROM checklist_runs WHERE id='${runId}' AND user_id='${owner}' AND deleted_at IS NULL;`],
      ['exec', 'wrangler', 'd1', 'info', name, '--json'],
    ]);
    const origin = deploymentUrl.replace(/\/$/, '');
    const t = '/api/templates/' + templateId; const r = '/api/checklists/' + runId;
    const requests = JSON.parse(readFileSync(f.httpRequests, 'utf8'));
    expect(requests.map(({method, url}) => method + ' ' + url)).toEqual([
      'GET ' + origin + '/api/templates', 'GET ' + origin + '/api/checklists',
      'GET ' + origin + '/api/health', 'GET ' + targets[environment].customDomain + '/api/health',
      'PUT ' + origin + t, 'GET ' + origin + t, 'PUT ' + origin + r, 'GET ' + origin + r,
      'GET ' + origin + t, 'PUT ' + origin + t, 'GET ' + origin + t,
      'GET ' + origin + r, 'PUT ' + origin + r, 'GET ' + origin + r,
    ]);
    expect(requests.filter(({method}) => method === 'PUT').map(({body}) => body)).toEqual([
      { title: 'Private canary title [write probe]', expected_version: 3 },
      { progress: 42, expected_revision: 2 },
      { title: 'Private canary title', expected_version: 4 },
      { progress: 10, expected_revision: 3 },
    ]);
    for (const request of requests) {
      expect(request.redirect).toBe('error');
      if (request.url.endsWith('/api/health')) expect(request.headers).toBeUndefined();
      else expect(request.headers).toEqual({cookie, accept: 'application/json', 'content-type': 'application/json'});
    }
    const files = artifacts(f, environment); const report = JSON.parse(files.json);
    expect(report).toMatchObject({ verdict: 'pass', commit, target: { environment, binding: 'DB', databaseName: targets[environment].databaseName, databaseId: targets[environment].databaseId }, migrationRange: {from: null, to: null}, deploymentUrl, customDomain: targets[environment].customDomain + '/' });
    expect(report.checks.every(check => check.verdict === 'pass')).toBe(true);
    expect(report.evidenceChecks.every(check => check.verdict === 'pass')).toBe(true);
    expect(report.canaryEvidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    const observed = {databaseName: name, databaseId: targets[environment].databaseId};
    expect(report.identityChecks).toEqual([{
      ...(environment === 'production' ? {environment, binding: 'DB', ...observed} : {}),
      before: observed, after: observed,
    }]);
    expect(files['junit.xml']).toContain('failures="0"');
    for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of [...sentinels, 'Private canary title']) expect(text).not.toContain(sentinel);
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it('canary URL fixtures match the checked-in deployment workflow and Pages project', () => {
  const workflow = yaml.load(readFileSync(join(repoRoot, '.github/workflows/cloudflare-pages-deploy.yml'), 'utf8'));
  expect(workflow.env.CLOUDFLARE_PAGES_PROJECT).toBe('serplists-com');
  for (const environment of ['staging', 'production']) {
    const steps = workflow.jobs[environment + '_postdeploy'].steps;
    const smoke = steps.find(step => step.run?.includes('node scripts/data/deployment-smoke.mjs'));
    expect(smoke.run).toContain('--environment ' + environment + ' --binding DB');
    expect(smoke.run).toContain('--custom-domain ' + targets[environment].customDomain);
    expect(smoke.run).toContain('--database-name ' + targets[environment].databaseName);
    expect(smoke.env.DATA_CANARY_MUTATION_APPROVED).toBe('true');
    if (environment === 'staging') expect(smoke.run).toContain('--deployment-url ' + targets.staging.deploymentUrl);
    else expect(smoke.run).toContain('--deployment-url "$(cat tmp/production-deployment-url.txt)"');
  }
  expect(workflow.jobs.production_deploy.steps.find(step => step.id === 'production_pages_deploy').run).toContain('--branch main');
});

it.each([
  ['binding', toml => toml.replaceAll('binding = "DB"', 'binding = "OTHER"')],
  ['name', toml => toml.replace('database_name = "serp-checklists-staging-db"', 'database_name = "unknown"')],
  ['UUID', toml => toml.replaceAll(targets.staging.databaseId, 'fcaf4325-5be7-4ead-ab60-45932a041770')],
  ['production alias', toml => toml.replaceAll(targets.staging.databaseId, targets.production.databaseId)],
])('bounded153 rejects configured %s drift before transport', async (_name, mutate) => {
  const f = await fakeFetchFixture('ok');
  const file = join(repoRoot, 'wrangler.toml');
  f.configuration = { [file]: mutate(readFileSync(file, 'utf8')) };
  try {
    const result = await runCli(f, 'staging');
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    expect(JSON.parse(artifacts(f, 'staging').json)).toMatchObject({verdict: 'fail', failedStage: 'configuration'});
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

const privateContext = 'private_context_sentinel_153';
const failureContextCases = [
  ...['--environment', '--binding', '--database-name', '--database-id', '--deployment-url', '--custom-domain'].map(option => [option, args => {
    const result = [...args]; result[result.indexOf(option) + 1] = privateContext; return result;
  }]),
  ...['--environment', '--binding', '--database-name', '--database-id', '--migration-from', '--migration-to'].map(option => ['duplicate ' + option, args => [...args, option, privateContext]]),
  ...['--migration-from', '--migration-to'].map(option => [option, args => {
    const result = [...args]; result[result.indexOf(option) + 1] = privateContext; return result;
  }]),
  ['unknown migration filenames', args => {
    const result = [...args];
    result[result.indexOf('--migration-from') + 1] = '0022_' + privateContext + '.sql';
    result[result.indexOf('--migration-to') + 1] = '0023_' + privateContext + '.sql';
    return [...result, '--unknown'];
  }],
  ['commit', args => [...args, '--unknown']],
];

it.each(failureContextCases)('privacy153 rejected %s cannot leak into any CLI failure artifact', async (field, mutate) => {
  const f = await fakeFetchFixture('ok'); f.args = mutate;
  if (field === 'commit') writeFileSync(f.preload, readFileSync(f.preload, 'utf8') + '\nprocess.env.GITHUB_SHA = ' + JSON.stringify(privateContext) + ';\n');
  try {
    const result = await runCli(f, 'staging');
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    const names = readdirSync(f.reports).sort();
    const safeEnvironment = field.includes('--environment') ? 'unknown' : 'staging';
    expect.soft(names).toEqual(['json', 'junit.xml', 'md', 'txt'].map(extension => safeEnvironment + '-postdeploy-smoke.' + extension).sort());
    const outputs = names.map(name => readFileSync(join(f.reports, name), 'utf8'));
    for (const text of [...names, ...outputs, result.stdout, result.stderr]) expect.soft(text).not.toContain(privateContext);
    const report = JSON.parse(outputs[names.findIndex(name => name.endsWith('.json'))]);
    expect(report).toMatchObject({verdict: 'fail', failedStage: 'configuration', targetSource: 'validated-local-configuration'});
    expect(report).not.toHaveProperty('identityChecks');
    expect(report).not.toHaveProperty('observedIdentity');
    expect(report.commit).toBe(field === 'commit' ? 'unknown' : commit);
    expect(report.target.environment).toBe(safeEnvironment);
    expect(report.target.binding).toBe(field.includes('--binding') ? 'unknown' : 'DB');
    expect(report.target.databaseName).toBe(safeEnvironment === 'unknown' || field.includes('--database-name') ? 'unknown' : targets.staging.databaseName);
    expect(report.target.databaseId).toBe(safeEnvironment === 'unknown' || field.includes('--database-id') ? 'unknown' : targets.staging.databaseId);
    expect(report.migrationRange).toEqual(field.includes('migration') ? {from: 'invalid', to: 'invalid'} : {from: null, to: null});
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it.each(['staging', 'production'])('privacy153 preserves independently validated %s context without asserting observed identity', async environment => {
  const f = await fakeFetchFixture('ok');
  f.args = args => [...args, '--unknown', privateContext];
  try {
    const from = '0023_add_sitemap_revision_state.sql'; const to = '0024_safe_template_evolution.sql';
    const result = await runCli(f, environment, undefined, undefined, ['--migration-from', from, '--migration-to', to]);
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    const files = artifacts(f, environment); const report = JSON.parse(files.json);
    expect(report).toMatchObject({commit, targetSource: 'validated-local-configuration', target: {environment, binding: 'DB', databaseName: targets[environment].databaseName, databaseId: targets[environment].databaseId}, migrationRange: {from, to}});
    expect(report).not.toHaveProperty('identityChecks');
    for (const text of [...Object.values(files), result.stderr]) {
      for (const value of [commit, targets[environment].databaseName, targets[environment].databaseId, from, to]) expect(text).toContain(value);
      expect(text).not.toContain(privateContext);
    }
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});

it('privacy153 leaves target fields unknown when checked-in identity configuration cannot validate', async () => {
  const f = await fakeFetchFixture('ok');
  const file = join(repoRoot, 'wrangler.toml');
  f.configuration = {[file]: readFileSync(file, 'utf8').replaceAll('binding = "DB"', 'binding = "' + privateContext + '"')};
  try {
    const result = await runCli(f, 'staging');
    expect(result.code).toBe(1);
    expect(existsSync(f.callsPath)).toBe(false);
    expect(existsSync(f.httpCalls)).toBe(false);
    const files = artifacts(f, 'staging');
    expect(JSON.parse(files.json).target).toEqual({environment: 'staging', binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown'});
    for (const text of [...Object.values(files), result.stdout, result.stderr]) expect(text).not.toContain(privateContext);
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});
