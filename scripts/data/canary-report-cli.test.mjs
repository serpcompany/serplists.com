import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { safeCanaryFailure } from './canary-diagnostics.mjs';

const execute = promisify(execFile);
const commit = 'c'.repeat(40);
const owner = 'OWNER_SENTINEL_111';
const templateId = 'TEMPLATE_SENTINEL_111';
const runId = 'RUN_SENTINEL_111';
const cookie = 'session=SESSION_SENTINEL_111';
const key = 'EVIDENCE_KEY_SENTINEL_111_'.repeat(3);
const sentinels = [owner, templateId, runId, cookie, 'SESSION_SENTINEL_111', key, 'PROVIDER_SECRET_SENTINEL_111', 'STDERR_SENTINEL_111', 'SQL_SENTINEL_111'];
const repoRoot = resolve('.');

function fixture(failQuery) {
  const directory = mkdtempSync(join(tmpdir(), 'canary-cli-privacy-'));
  const callsPath = join(directory, 'calls.jsonl');
  const stub = join(directory, 'pnpm');
  writeFileSync(stub, `#!${process.execPath}\nconst fs = require('node:fs');\nconst operation = process.argv.includes('info') ? 'info' : 'execute';\nfs.appendFileSync(${JSON.stringify(callsPath)}, operation+'\\n');\nif(operation === 'info') console.log(JSON.stringify({name:'fixture-db',uuid:'fixture-id'}));\nelse if(${JSON.stringify(failQuery)}) { process.stderr.write(${JSON.stringify(sentinels.join(' ') + '\n')}); process.stdout.write(${JSON.stringify(sentinels.join(' ') + '\n')}); process.exit(27); }\nelse console.log(JSON.stringify([{results:${JSON.stringify([{ kind: 'template', id: templateId, title: 'Private canary title', version: 3 }, { kind: 'run', id: runId, progress: 10, revision: 2 }])}}]));\n`);
  chmodSync(stub, 0o700);
  return { directory, callsPath, reports: join(directory, 'reports') };
}

async function runCli(f, environment, deploymentUrl = 'http://127.0.0.1:1', customDomain = 'http://127.0.0.1:1', extraArgs = ['--migration-from', 'none', '--migration-to', 'none']) {
  try {
    const result = await execute(process.execPath, [...(f.preload ? ['--import', f.preload] : []), 'scripts/data/deployment-smoke.mjs', ...extraArgs, '--environment', environment, '--database-name', 'fixture-db', '--database-id', 'fixture-id', '--deployment-url', deploymentUrl, '--custom-domain', customDomain, '--report-dir', f.reports], {
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

async function listen(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
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
      expect(report).toMatchObject({ verdict: 'fail', commit, target: { environment, databaseName: 'fixture-db', databaseId: 'fixture-id' }, failedStage: 'd1-query', errorCode: 'CANARY_SUBPROCESS_FAILED', exitStatus: 27 });
      for (const text of [...Object.values(files), result.stderr]) for (const context of [commit, environment, 'fixture-db', 'fixture-id']) expect(text).toContain(context);
      expect(files['junit.xml']).toMatch(/failures="[1-9][0-9]*"/);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });

  it.each([200, 500])('reports actual custom-domain HTTP%s consistently after successful canary restoration', async healthStatus => {
    const f = fixture(false);
    const state = { template: { id: templateId, user_id: owner, title: 'Private canary title', version: 3 }, run: { id: runId, user_id: owner, progress: 10, revision: 2 } };
    const api = await listen(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk;
      let value;
      if (req.url === '/api/templates') value = [state.template];
      else if (req.url === '/api/checklists') value = [state.run];
      else if (req.url === '/api/health') value = { status: 'ok' };
      else {
        const row = req.url.includes('templates') ? state.template : state.run;
        if (req.method === 'PUT') {
          const input = JSON.parse(body);
          if (row === state.template) { row.title = input.title; row.version += 1; }
          else { row.progress = input.progress; row.revision += 1; }
        }
        value = row;
      }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value));
    });
    const custom = await listen((_req, res) => { res.statusCode = healthStatus; res.end('health'); });
    try {
      const result = await runCli(f, 'staging', api.origin, custom.origin);
      expect(result.code).toBe(healthStatus === 200 ? 0 : 1);
      expect(state.template).toMatchObject({ title: 'Private canary title', version: healthStatus === 200 ? 5 : 3 });
      expect(state.run).toMatchObject({ progress: 10, revision: healthStatus === 200 ? 4 : 2 });
      const files = artifacts(f, 'staging');
      const report = JSON.parse(files.json);
      expect(report.checks.every(check => check.verdict === 'pass')).toBe(healthStatus === 200);
      expect(report.verdict).toBe(healthStatus === 200 ? 'pass' : 'fail');
      expect(report.evidenceChecks).toContainEqual({ name: 'custom_domain_health', verdict: report.verdict });
      expect(files['junit.xml']).toMatch(healthStatus === 200 ? /failures="0"/ : /failures="[1-9][0-9]*"/);
      expect(files['junit.xml']).toContain('name="custom_domain_health"');
      for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of [...sentinels, 'Private canary title']) expect(text).not.toContain(sentinel);
    } finally {
      await Promise.all([api.server, custom.server].map(server => new Promise(resolve => server.close(resolve))));
      rmSync(f.directory, { recursive: true, force: true });
    }
  });

  it.each([200, 401])('names authenticated visibility failure for HTTP%s with missing owned rows', async templateStatus => {
    const f = fixture(false);
    let writes = 0;
    const api = await listen((req, res) => {
      if (req.method === 'PUT') writes += 1;
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/templates') { res.statusCode = templateStatus; res.end(JSON.stringify(templateStatus === 200 ? [] : { error: 'Unauthorized' })); }
      else if (req.url === '/api/checklists') res.end(JSON.stringify([{ id: runId, user_id: owner, progress: 10, revision: 2 }]));
      else res.end(JSON.stringify({ status: 'ok' }));
    });
    try {
      const result = await runCli(f, 'staging', api.origin, api.origin);
      expect(result.code).toBe(1);
      expect(writes).toBe(0);
      const files = artifacts(f, 'staging');
      expect(JSON.parse(files.json).checks).toContainEqual({ name: 'authenticated_canary_visibility', verdict: 'fail' });
      expect(files['junit.xml']).toContain('name="authenticated_canary_visibility"');
      expect(files['junit.xml']).toMatch(/failures="[1-9][0-9]*"/);
      for (const text of [...Object.values(files), result.stdout, result.stderr]) for (const sentinel of sentinels) expect(text).not.toContain(sentinel);
    } finally {
      await new Promise(resolve => api.server.close(resolve));
      rmSync(f.directory, { recursive: true, force: true });
    }
  });
});

it('does not trust error-owned diagnostic fields or arbitrary stage strings', () => {
  const error = Object.assign(new Error('SECRET'), { canaryFailure: { message: 'SECRET' }, status: 'SECRET' });
  expect(JSON.stringify(safeCanaryFailure('SECRET', error))).not.toContain('SECRET');
});

async function fakeFetchFixture(mode) {
  const f = fixture(false);
  f.preload = join(f.directory, 'transport.mjs');
  f.httpCalls = join(f.directory, 'http.json');
  writeFileSync(f.preload, `
    import { writeFileSync } from 'node:fs';
    const mode = ${JSON.stringify(mode)};
    const state = { template: { id: ${JSON.stringify(templateId)}, user_id: ${JSON.stringify(owner)}, title: 'Private canary title', version: 3 }, run: { id: ${JSON.stringify(runId)}, user_id: ${JSON.stringify(owner)}, progress: 10, revision: 2 } };
    const calls = []; let mutations = 0;
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url).pathname;
      const method = init.method ?? 'GET';
      calls.push(method + ' ' + path); writeFileSync(${JSON.stringify(f.httpCalls)}, JSON.stringify(calls));
      if (mode === 'transport' && path === '/api/templates') throw new Error('SESSION_SENTINEL_111');
      if (path === '/api/health') return { status: mode === 'health500' ? 500 : 200, json: async () => ({}) };
      if (path === '/api/templates' || path === '/api/checklists') return { status: mode === 'api500' ? 500 : 200, json: async () => [path.includes('templates') ? {...state.template} : {...state.run}] };
      const row = path.includes('templates') ? state.template : state.run;
      if (method === 'PUT') {
        mutations++;
        if (mode === 'write500' && mutations === 1) return { status: 500, json: async () => ({}) };
        if (mode === 'cleanup500' && mutations === 3) return { status: 500, json: async () => ({}) };
        const input = JSON.parse(init.body);
        if (row === state.template) { row.title = input.title; row.version++; } else { row.progress = input.progress; row.revision++; }
      }
      const probeRead = method === 'GET' && calls.filter(c => c === 'GET ' + path).length === 1;
      if (probeRead && mode === 'readThrow') throw new Error('SESSION_SENTINEL_111');
      return { status: probeRead && mode === 'read500' ? 500 : 200, json: async () => ({...row, ...(probeRead && mode === 'wrongRead' ? {title: 'wrong', progress: 99} : {})}) };
    };
  `);
  return f;
}

it.each(['ok', 'health500', 'api500', 'write500', 'read500', 'wrongRead', 'readThrow', 'transport', 'cleanup500'])('actual CLI fake transport stops safely for %s', async mode => {
  const f = await fakeFetchFixture(mode);
  try {
    const result = await runCli(f, 'staging', 'https://deployment.invalid', 'https://custom.invalid');
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
    const result = await runCli(f, 'staging', 'https://deployment.invalid', 'https://custom.invalid', args);
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
    const result = await runCli(f, 'staging', 'https://deployment.invalid', 'https://custom.invalid', ['--migration-from', from, '--migration-to', to]);
    expect(result.code).toBe(0);
    const files = artifacts(f, 'staging');
    expect(JSON.parse(files.json).migrationRange).toEqual({from, to});
    for (const text of Object.values(files)) { expect(text).toContain(from); expect(text).toContain(to); }
  } finally { rmSync(f.directory, {recursive: true, force: true}); }
});
