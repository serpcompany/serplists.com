import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const sentinel = 'PRIVATE_PROVIDER_RANGE_128';
const files = ['0001_first.sql', '0002_second.sql', '0003_third.sql'];
const table = names => `Migrations to be applied:\n┌──────────────────┐\n${names.map(name => `│ ${name} │`).join('\n')}\n└──────────────────┘\n`;

// Copy the actual CLI and its real parsers. Only the provider executable and
// the output-write failure are doubles; no loader replaces application modules.
function run(mode, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'reviewed-range-128-'));
  try {
    mkdirSync(path.join(dir, 'scripts/data'), { recursive: true });
    mkdirSync(path.join(dir, 'db/migrations'), { recursive: true });
    mkdirSync(path.join(dir, 'bin'));
    writeFileSync(path.join(dir, 'bin/package.json'), '{"type":"commonjs"}');
    for (const name of ['check-reviewed-migration-range.mjs', 'pending-migrations-lib.mjs', 'migration-range-lib.mjs', 'wrangler-identity-lib.mjs', 'git-subprocess-env.mjs', 'strict-json-lib.mjs']) {
      copyFileSync(path.join(root, 'scripts/data', name), path.join(dir, 'scripts/data', name));
    }
    for (const name of files) writeFileSync(path.join(dir, 'db/migrations', name), '-- owned fixture\n');
    writeFileSync(path.join(dir, 'bin/pnpm'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const calls = 'calls.jsonl';
const n = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\\n').length + 1 : 1;
fs.appendFileSync(calls, JSON.stringify(args) + '\\n');
process.stderr.write(${JSON.stringify(sentinel)});
if (n === Number(process.env.FAIL_AT)) { process.stdout.write(${JSON.stringify(sentinel)}); process.exit(31); }
if (n === Number(process.env.BAD_AT)) { process.stdout.write(process.env.BAD_OUTPUT); process.exit(0); }
if (args[3] === 'info') console.log(JSON.stringify({name: process.env.DATABASE_NAME, uuid: process.env.DATABASE_ID, private: ${JSON.stringify(sentinel)}}));
else if (args[3] === 'migrations' && args[4] === 'list') process.stdout.write(process.env.PENDING);
else process.exit(99);
`, { mode: 0o700 });
    writeFileSync(path.join(dir, 'report-failure.cjs'), `console.log = () => { throw new Error(${JSON.stringify(sentinel)}); };`);
    if (options.noFiles) rmSync(path.join(dir, 'db/migrations'), { recursive: true });
    const result = spawnSync(process.execPath, [
      ...(options.reportFailure ? ['--require', path.join(dir, 'report-failure.cjs')] : []),
      'scripts/data/check-reviewed-migration-range.mjs', ...(mode === undefined ? [] : [mode]),
    ], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: {
        PATH: options.missingTransport ? path.join(dir, 'missing-bin') : path.join(dir, 'bin'), HOME: dir,
        DATABASE_NAME: `owned-${sentinel}`, DATABASE_ID: '11111111-1111-4111-8111-111111111111',
        MIGRATION_FROM: files[1], MIGRATION_TO: files[2],
        PENDING: mode === 'before' ? table([files[2], files[1]]) : 'No migrations to apply!\n',
        ...options.env,
      },
    });
    expect(result.error).toBeUndefined();
    const output = result.stdout + result.stderr;
    expect(output.includes(sentinel), 'private provider/argument text leaked').toBe(false);
    expect(output.includes(dir), 'raw filesystem path leaked').toBe(false);
    const calls = existsSync(path.join(dir, 'calls.jsonl')) ? readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
    return { ...result, calls };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function blocked(result, stage, count, status = 'unavailable') {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`BLOCKED reviewed migration ledger; stage: ${stage}; code: reviewed-range-failed; status: ${status}.\n`);
  expect(result.calls).toHaveLength(count);
}

describe('bounded128 actual reviewed-range CLI diagnostics', () => {
  for (const mode of ['before', 'after']) {
    it(`${mode} uses real range/list parsers and adjacent identities`, () => {
      const result = run(mode);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`PASS ${mode} reviewed migration ledger.\n`);
      expect(result.stderr).toBe('');
      expect(result.calls).toEqual([
        ['exec', 'wrangler', 'd1', 'info', `owned-${sentinel}`, '--json'],
        ['exec', 'wrangler', 'd1', 'migrations', 'list', `owned-${sentinel}`, '--remote'],
        ['exec', 'wrangler', 'd1', 'info', `owned-${sentinel}`, '--json'],
      ]);
    });
    it(`${mode} accepts an explicitly empty reviewed range`, () => {
      expect(run(mode, { env: { MIGRATION_FROM: 'none', MIGRATION_TO: 'none', PENDING: 'No migrations to apply!' } }).status).toBe(0);
    });
    for (const [n, stage] of [[1, 'identity-before'], [2, 'pending-list'], [3, 'identity-after']]) {
      it(`${mode} contains subprocess failure ${n} and stops subsequent calls`, () => {
        blocked(run(mode, { env: { FAIL_AT: String(n) } }), stage, n, 31);
      });
      it(`${mode} contains malformed response ${n}`, () => {
        blocked(run(mode, { env: { BAD_AT: String(n), BAD_OUTPUT: sentinel } }), n === 2 ? 'pending-parse' : stage, n === 2 ? 3 : n);
      });
    }
    for (const n of [1, 3]) {
      for (const identity of [
        { name: sentinel, uuid: '11111111-1111-4111-8111-111111111111' },
        { name: `owned-${sentinel}`, uuid: sentinel },
        { name: `owned-${sentinel}`, uuid: '11111111-1111-4111-8111-111111111111', success: false },
      ]) {
        it(`${mode} rejects identity drift/status at call ${n}: ${JSON.stringify(identity)}`, () => {
          blocked(run(mode, { env: { BAD_AT: String(n), BAD_OUTPUT: JSON.stringify(identity) } }), n === 1 ? 'identity-before' : 'identity-after', n);
        });
      }
    }
    it(`${mode} contains output reporting failure`, () => blocked(run(mode, { reportFailure: true }), 'reporting', 3));
    for (const pending of [table([files[1], files[1]]), table(['9999_unknown.sql']), sentinel]) {
      it(`${mode} rejects invalid pending transport ${pending}`, () => blocked(run(mode, { env: { PENDING: pending } }), 'pending-parse', 3));
    }
    it(`${mode} rejects pending range mismatch`, () => blocked(run(mode, { env: { PENDING: table([files[1]]) } }), 'reviewed-range', 3));
    it(`${mode} contains unavailable nested provider transport`, () => blocked(run(mode, { missingTransport: true }), 'identity-before', 0));
    for (const range of [
      { MIGRATION_FROM: sentinel }, { MIGRATION_FROM: 'none' }, { MIGRATION_FROM: undefined },
      { MIGRATION_FROM: files[2], MIGRATION_TO: files[1] },
      { MIGRATION_TO: '9999_unknown.sql' },
    ]) {
      it(`${mode} rejects invalid range before provider operations ${JSON.stringify(range)}`, () => blocked(run(mode, { env: range }), 'range-configuration', 0));
    }
  }
  it('before rejects a clean ledger when reviewed migrations remain expected', () => blocked(run('before', { env: { PENDING: 'No migrations to apply!' } }), 'reviewed-range', 3));
  it('before rejects extra known pending migrations', () => blocked(run('before', { env: { PENDING: table(files) } }), 'reviewed-range', 3));
  it('before retains a reviewed single-file interior range', () => {
    expect(run('before', { env: { MIGRATION_TO: files[1], PENDING: table([files[1]]) } }).status).toBe(0);
  });
  for (const mode of [undefined, '', sentinel]) {
    it(`rejects unsupported mode ${mode} before any provider operation`, () => blocked(run(mode), 'mode', 0));
  }
  it('contains repository file errors without provider calls', () => blocked(run('before', { noFiles: true }), 'range-configuration', 0));
});
