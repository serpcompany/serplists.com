import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
import { describe, it, expect } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, statSync, existsSync, lstatSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const id = '11111111-1111-4111-8111-111111111111';
const secret = 'PRIVATE_EXPORT_SENTINEL_157';
const bytes = Buffer.from([0, 255, 13, 10, 39, 59, 10]);

function fixture(mode = 'success') {
  mkdirSync(path.join(root, 'tmp'), { recursive: true });
  const dir = mkdtempSync(path.join(root, 'tmp/export157-'));
  mkdirSync(path.join(dir, 'scripts/data'), { recursive: true });
  for (const name of ['production-identity-bound-command.mjs', 'production-identity-bound-command-lib.mjs', 'sanitizer-export-output-lib.mjs', 'sanitizer-export-provider.mjs', 'workflow-request-context-lib.mjs', 'git-subprocess-env.mjs', 'canary-diagnostics.mjs', 'wrangler-identity-lib.mjs', 'strict-json-lib.mjs']) {
    cpSync(path.join(root, 'scripts/data', name), path.join(dir, 'scripts/data', name));
  }
  writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  mkdirSync(path.join(dir, 'node_modules/wrangler/wrangler-dist'), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules/wrangler/package.json'), '{"name":"wrangler","type":"module"}');
  const output = path.join(dir, 'tmp/production-sensitive/source.sql');
  const evidence = path.join(dir, 'tmp/data-evidence/identity.json');
  const calls = path.join(dir, 'calls.jsonl');
  const sentinel = path.join(dir, 'sentinel');
  writeFileSync(sentinel, secret);
  writeFileSync(path.join(dir, 'node_modules/wrangler/wrangler-dist/cli.js'), `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), mode = ${JSON.stringify(mode)};
const output = ${JSON.stringify(output)}, evidence = ${JSON.stringify(evidence)};
const calls = ${JSON.stringify(calls)}, sentinel = ${JSON.stringify(sentinel)};
fs.appendFileSync(calls, JSON.stringify(args) + '\\n');
const count = fs.readFileSync(calls, 'utf8').trim().split('\\n').length;
if (args[1] === 'export') {
  if (mode === 'output-race') { fs.renameSync(output, output + '.held'); fs.writeFileSync(output, ${JSON.stringify(secret)}); }
  if (mode === 'symlink-race') { fs.renameSync(output, output + '.held'); fs.symlinkSync(sentinel, output); }
  if (mode === 'parent-race') { fs.renameSync(path.dirname(output), path.dirname(output) + '.held'); fs.mkdirSync(path.dirname(output)); fs.writeFileSync(output, ${JSON.stringify(secret)}); }
  if (mode !== 'empty') await fs.promises.writeFile(args[args.indexOf('--output') + 1], (async function* () { yield Buffer.from(${JSON.stringify([...bytes.subarray(0, 3)])}); yield Buffer.from(${JSON.stringify([...bytes.subarray(3)])}); })());
  if (mode === 'export-failure' || mode === 'cleanup-failure') { console.log(${JSON.stringify(secret)}); console.error(${JSON.stringify(secret)}); process.exit(37); }
} else {
  if (count === 3 && mode === 'evidence-race') { fs.renameSync(evidence, evidence + '.held'); fs.writeFileSync(evidence, ${JSON.stringify(secret)}); }
  if (count === 3 && mode === 'evidence-mode-race') fs.chmodSync(evidence, 0o400);
  if (count === 3 && mode === 'identity-failure') { console.error(${JSON.stringify(secret)}); process.exit(38); }
  console.log(JSON.stringify({ name: 'fake-production-db', uuid: ((count === 3 && mode === 'identity-mismatch') || mode === 'before-mismatch') ? '22222222-2222-4222-8222-222222222222' : ${JSON.stringify(id)} }));
}
`);
  const fault = path.join(dir, 'fault.mjs');
  writeFileSync(fault, `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const originalWrite = fs.writeFileSync, originalTruncate = fs.ftruncateSync, originalOpen = fs.openSync;
if (${JSON.stringify(mode)} === 'acquisition-race') fs.openSync = (file, ...options) => {
  if (file === ${JSON.stringify(output)}) originalWrite(file, ${JSON.stringify(secret)});
  return originalOpen(file, ...options);
};
if (${JSON.stringify(mode)} === 'evidence-write-failure') fs.writeFileSync = (fd, data, ...options) => {
  if (typeof fd === 'number' && fs.fstatSync(fd).ino === fs.statSync(${JSON.stringify(evidence)}).ino) {
    originalWrite(fd, String(data).slice(0, 30));
    throw new Error(${JSON.stringify(secret)});
  }
  return originalWrite(fd, data, ...options);
};
if (${JSON.stringify(mode)} === 'cleanup-failure') fs.ftruncateSync = (fd, size) => {
  if (fs.fstatSync(fd).ino === fs.statSync(${JSON.stringify(output)}).ino) throw new Error(${JSON.stringify(secret)});
  return originalTruncate(fd, size);
};
syncBuiltinESMExports();
`);
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout.trim();
  const env = { PATH: process.env.PATH, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'serpcompany/serplists.com', GITHUB_REF_PROTECTED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', DATA_PROMOTION_WORKFLOW: 'data-promotion', GITHUB_REF: 'refs/heads/main', DATA_PROTECTED_ENVIRONMENT: 'production', GITHUB_SHA: commit, GITHUB_RUN_ID: '157', CLOUDFLARE_API_TOKEN: 'synthetic-not-a-credential' };
  const args = ['sanitizer-export', '--database-name', 'fake-production-db', '--database-id', id, '--output', output, '--evidence', evidence];
  return { dir, output, evidence, sentinel, env, args,
    calls: () => existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : [],
    run: () => spawnSync(process.execPath, ['--import', fault, path.join(dir, 'scripts/data/production-identity-bound-command.mjs'), ...args], { cwd: dir, env, encoding: 'utf8' }),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('mandatory actual sanitizer-export CLI with installed-provider double', () => {
  for (const scenario of ['rejected-context', 'missing', 'missing-output', 'missing-name', 'missing-id', 'bare', 'duplicate', 'unknown', 'operation', 'invalid-id', 'outside', 'root', 'existing-output', 'existing-evidence', 'output-symlink', 'dangling-symlink', 'evidence-symlink', 'parent-symlink']) {
    it(`${scenario}: zero provider calls and no caller-file changes`, () => {
      const f = fixture();
      try {
        mkdirSync(path.dirname(f.output), { recursive: true });
        mkdirSync(path.dirname(f.evidence), { recursive: true });
        if (scenario === 'rejected-context') { delete f.env.GITHUB_ACTIONS; writeFileSync(f.output, secret); }
        if (scenario === 'missing') f.args.splice(7, 2);
        if (scenario === 'missing-output') f.args.splice(5, 2);
        if (scenario === 'missing-name') f.args.splice(1, 2);
        if (scenario === 'missing-id') f.args.splice(3, 2);
        if (scenario === 'bare') f.args.pop();
        if (scenario === 'duplicate') f.args.push('--output', f.output);
        if (scenario === 'unknown') f.args.push('--unsafe', 'yes');
        if (scenario === 'operation') f.args[0] = 'recovery-export';
        if (scenario === 'invalid-id') f.args[4] = secret;
        if (scenario === 'outside') f.args[6] = f.sentinel;
        if (scenario === 'root') f.args[6] = path.dirname(f.output);
        if (scenario === 'existing-output') writeFileSync(f.output, secret);
        if (scenario === 'existing-evidence') writeFileSync(f.evidence, secret);
        if (scenario === 'output-symlink') symlinkSync(f.sentinel, f.output);
        if (scenario === 'dangling-symlink') symlinkSync(path.join(f.dir, 'absent'), f.output);
        if (scenario === 'evidence-symlink') symlinkSync(f.sentinel, f.evidence);
        if (scenario === 'parent-symlink') { rmSync(path.dirname(f.output), { recursive: true }); symlinkSync(f.dir, path.dirname(f.output)); }
        const before = [f.output, f.evidence].map(p => { try { return lstatSync(p); } catch { return null; } });
        const result = f.run();
        expect(result.status).toBe(1);
        expect(f.calls()).toEqual([]);
        expect(result.stderr).not.toContain(secret);
        expect(result.stdout).toBe('');
        expect(JSON.parse(result.stderr).cleanup).toBe('not-acquired');
        expect(readFileSync(f.sentinel, 'utf8')).toBe(secret);
        for (const [index, p] of [f.output, f.evidence].entries()) {
          if (before[index]) { expect(lstatSync(p).ino).toBe(before[index].ino); if (before[index].isFile()) expect(readFileSync(p, 'utf8')).toBe(secret); }
          else expect(existsSync(p)).toBe(false);
        }
      } finally { f.close(); }
    });
  }
  it('acquisition-race: exclusive create preserves a raced-in caller file with zero provider calls', () => {
    const f = fixture('acquisition-race');
    try {
      const result = f.run();
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr).cleanup).toBe('not-acquired');
      expect(f.calls()).toEqual([]);
      expect(readFileSync(f.output, 'utf8')).toBe(secret);
      expect(existsSync(f.evidence)).toBe(false);
    } finally { f.close(); }
  });
  for (const mode of ['success', 'before-mismatch', 'export-failure', 'empty', 'identity-failure', 'identity-mismatch', 'evidence-write-failure', 'evidence-mode-race', 'evidence-race', 'output-race', 'symlink-race', 'parent-race', 'cleanup-failure']) {
    it(`${mode}: exact bytes or verified owned-inode cleanup`, () => {
      const f = fixture(mode);
      try {
        const result = f.run();
        expect(result.stderr).not.toContain(secret);
        expect(result.stdout).toBe('');
        if (mode === 'success') {
          expect(result.status, result.stderr).toBe(0);
          expect(readFileSync(f.output)).toEqual(bytes);
          expect(JSON.parse(readFileSync(f.evidence, 'utf8'))).toMatchObject({ verdict: 'pass', operation: 'sanitizer-export', databaseId: id, before: { databaseId: id }, after: { databaseId: id } });
          for (const p of [f.output, f.evidence]) expect(statSync(p).mode & 0o777).toBe(0o600);
          for (const p of [path.dirname(f.output), path.dirname(f.evidence)]) expect(statSync(p).mode & 0o777).toBe(0o700);
          expect(f.calls()).toEqual([['d1', 'info', 'fake-production-db', '--json'], ['d1', 'export', 'fake-production-db', '--remote', '--no-schema', '--output', '/dev/fd/3'], ['d1', 'info', 'fake-production-db', '--json']]);
        } else {
          expect(result.status, result.stderr).toBe(1);
          expect(JSON.parse(result.stderr)).toMatchObject({ verdict: 'fail', cleanup: mode === 'cleanup-failure' ? 'unverified' : 'owned-inodes-cleared' });
          if (mode === 'export-failure' || mode === 'identity-failure') expect(JSON.parse(result.stderr)).toMatchObject({ errorCode: 'CANARY_SUBPROCESS_FAILED', exitStatus: mode === 'export-failure' ? 37 : 38 });
          expect(result.stderr).not.toContain('"pass"');
          const replacedOutput = ['output-race', 'symlink-race', 'parent-race'].includes(mode);
          expect(readFileSync(f.output)).toEqual(replacedOutput ? Buffer.from(secret) : mode === 'cleanup-failure' ? bytes : Buffer.alloc(0));
          expect(readFileSync(f.evidence)).toEqual(mode === 'evidence-race' ? Buffer.from(secret) : Buffer.alloc(0));
          if (mode === 'output-race' || mode === 'symlink-race') expect(statSync(f.output + '.held').size).toBe(0);
          if (mode === 'parent-race') expect(statSync(path.join(path.dirname(f.output) + '.held', 'source.sql')).size).toBe(0);
          if (mode === 'evidence-race') expect(statSync(f.evidence + '.held').size).toBe(0);
          expect(f.calls().length).toBe(mode === 'before-mismatch' ? 1 : replacedOutput ? 2 : 3);
        }
        expect(readFileSync(f.sentinel, 'utf8')).toBe(secret);
      } finally { f.close(); }
      if (mode === 'success') recordIntegrationScenario('sanitizer-export-ownership');
  });
  }
});
