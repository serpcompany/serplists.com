import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '../..');
const node = process.execPath;
// Real CLI children and isolated Git copies need a bounded integration timeout.
vi.setConfig({ testTimeout: 60_000 });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'data-report-cli-'));
  const gitEnv = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const clone = spawnSync('git', ['clone', '--local', '--no-hardlinks', '--no-checkout', repo, root], { env: gitEnv, encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  // Copy only tracked working-tree inputs, never ignored exports or secrets.
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'scripts', 'src/lib/schemas', 'db', 'package.json', 'wrangler.toml'], { cwd: repo, env: gitEnv, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  for (const entry of tracked.stdout.split('\0').filter(Boolean)) {
    mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
    cpSync(path.join(repo, entry), path.join(root, entry));
  }
  // Explicit source dependency added by the concurrent invariant work.
  cpSync(path.join(repo, 'scripts/data/strict-json-lib.mjs'), path.join(root, 'scripts/data/strict-json-lib.mjs'));
  symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'));
  mkdirSync(path.join(root, 'bin'));
  writeFileSync(path.join(root, 'bin/pnpm'), `#!${node}
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args[0]!=='exec'||!['tsx','drizzle-kit'].includes(args[1])) process.exit(99);
const launch=args[1]==='tsx'?['--import','tsx']:[${JSON.stringify(path.join(repo, 'node_modules/drizzle-kit/bin.cjs'))}];
const r=spawnSync(${JSON.stringify(node)},[...launch,...args.slice(2)],{stdio:'inherit'});
process.exit(r.status??99);
`, { mode: 0o700 });
  const env = { PATH: `${root}/bin:${path.dirname(node)}:/usr/bin:/bin`, HOME: root, TMPDIR: root, CI: '1' };
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env, encoding: 'utf8' }).stdout.trim();
  return { root, env, commit };
}
function run(f, script, args = []) {
  return spawnSync(node, [...(script.endsWith('.ts') ? ['--import', 'tsx'] : []), `scripts/data/${script}`, ...args], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 60_000,
  });
}
function reports(f, name, directory = 'tmp/data-reports') {
  return Object.fromEntries(['json', 'junit.xml', 'txt', 'md'].map(ext => [ext, readFileSync(path.join(f.root, directory, `${name}.${ext}`), 'utf8')]));
}
function identity(files, expected, verdict) {
  const report = JSON.parse(files.json);
  assert.equal(report.verdict, verdict);
  assert.equal(report.commit, expected.commit);
  assert.deepEqual(report.target, expected.target);
  assert.deepEqual(report.migrationRange, expected.migrationRange);
  for (const ext of ['junit.xml', 'txt', 'md']) {
    for (const value of [expected.commit, ...Object.values(expected.target), ...Object.values(expected.migrationRange).map(v => v ?? 'none')]) assert.ok(files[ext].includes(value), `${ext} missing ${value}`);
  }
  assert.match(files['junit.xml'], verdict === 'pass' ? /failures="0"/ : /failures="[1-9]/);
}
const range = { from: '0001_initial_schema.sql', to: '0024_safe_template_evolution.sql' };
test('schema rejects otherwise-complete invalid configuration and valueless options before transport', () => {
  const f = fixture();
  try {
    const sentinel = 'private.customer@example.test';
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    const base = ['--database', 'serp-checklists-staging-db', '--label', 'staging'];
    const cases = [
      ['--database', 'serp-checklists-staging-db', '--label', sentinel],
      [...base, '--binding', sentinel], [...base, '--database-id', sentinel],
      ['--database', sentinel, '--label', 'staging'],
      ['--label', 'staging'], ['--database', 'serp-checklists-staging-db'],
      ['--database', '--label', 'staging'], ['--database', 'serp-checklists-staging-db', '--label', '--binding', 'DB'],
      ...['--binding', '--database-id', '--report-dir'].flatMap(option => [[...base, option], [...base, `${option}=`], [...base, option, '--preview']]),
      ['--label', 'staging', '--database'], ['--label', 'staging', '--database='],
      ['--database', 'serp-checklists-staging-db', '--label'], ['--database', 'serp-checklists-staging-db', '--label='],
    ];
    for (const args of cases) {
      const result = run(f, 'check-d1-schema.ts', args);
      assert.equal(result.status, 1, JSON.stringify(args));
      assert.equal(existsSync(marker), false, `transport attempted for ${JSON.stringify(args)}`);
      const label = args[args.indexOf('--label') + 1];
      const files = reports(f, `d1-schema-${label === 'staging' ? 'staging' : 'unknown'}`);
      assert.equal(JSON.parse(files.json).failedStage, 'schema-configuration');
      for (const output of [...Object.values(files), result.stdout, result.stderr]) assert.ok(!output.includes(sentinel));
      assert.match(files['junit.xml'], /failures="[1-9]/);
      if (args.includes('--binding') && args[args.indexOf('--binding') + 1] !== 'DB' && !args.includes(sentinel)) assert.equal(JSON.parse(files.json).target.binding, 'unknown');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema accepts absent default binding and explicit inline valid configuration', () => {
  const f = fixture();
  try {
    const marker = path.join(f.root, 'transport-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    for (const binding of [[], ['--binding', 'DB'], ['--binding=DB']]) {
      const result = run(f, 'check-d1-schema.ts', ['--database=serp-checklists-staging-db', '--label=staging', '--database-id=fcaf4325-5be7-4ead-ab60-45932a04177b', ...binding]);
      assert.equal(result.status, 1);
      assert.equal(existsSync(marker), true);
      const files = reports(f, 'd1-schema-staging');
      assert.equal(JSON.parse(files.json).failedStage, 'schema-identity');
      identity(files, { commit: f.commit, target: { environment: 'staging', binding: 'DB', databaseName: 'serp-checklists-staging-db', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b', mode: 'remote' }, migrationRange: range }, 'fail');
      rmSync(marker);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema replay failure preserves explicitly supplied repository-confirmed identity before transport', () => {
  const f = fixture();
  try {
    const target = { environment: 'staging', binding: 'DB', databaseName: 'serp-checklists-staging-db', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b', mode: 'remote' };
    writeFileSync(path.join(f.root, 'db/migrations/0001_initial_schema.sql'), 'INVALID FIXTURE SQL;');
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    const result = run(f, 'check-d1-schema.ts', ['--database', target.databaseName, '--label', target.environment, '--database-id', target.databaseId]);
    assert.equal(result.status, 1);
    identity(reports(f, 'd1-schema-staging'), { commit: f.commit, target, migrationRange: range }, 'fail');
    assert.equal(existsSync(marker), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema early failure preserves a repository-confirmed name without inventing a missing database ID', () => {
  const f = fixture();
  try {
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    const result = run(f, 'check-d1-schema.ts', ['--database', 'serp-checklists-db', '--label', 'production']);
    assert.equal(result.status, 1);
    const files = reports(f, 'd1-schema-production');
    identity(files, { commit: f.commit, target: { environment: 'production', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: 'unknown', mode: 'remote' }, migrationRange: range }, 'fail');
    assert.equal(JSON.parse(files.json).failedStage, 'schema-configuration');
    assert.equal(existsSync(marker), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema configuration failures never publish rejected database metadata before transport', () => {
  const f = fixture();
  try {
    const sentinel = 'private.customer@example.test';
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    for (const extra of [[], ['--binding', sentinel], ['--label', sentinel, '--database', 'unknown']]) {
      const result = run(f, 'check-d1-schema.ts', extra.includes('--label') ? extra : ['--database', sentinel, ...extra]);
      assert.equal(result.status, 1);
      assert.ok(existsSync(path.join(f.root, 'tmp/data-reports/d1-schema-unknown.json')), result.stdout + result.stderr);
      const files = reports(f, 'd1-schema-unknown');
      for (const output of [...Object.values(files), result.stdout, result.stderr]) assert.ok(!output.includes(sentinel));
      identity(files, { commit: f.commit, target: { environment: 'unknown', binding: extra.includes('--binding') ? 'unknown' : 'DB', databaseName: 'unknown', databaseId: 'unknown', mode: 'remote' }, migrationRange: range }, 'fail');
      assert.equal(JSON.parse(files.json).failedStage, 'schema-configuration');
      assert.equal(existsSync(marker), false);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('remote failures discard invalid identity fields and zero commits without transport', () => {
  const f = fixture();
  try {
    const sentinel = 'private.customer@example.test';
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    for (const field of ['commit', 'environment', 'binding', 'database-id']) {
      const input = { commit: f.commit, environment: 'rehearsal', binding: 'DB', database: 'serp-checklists-rehearsal-fixture', 'database-id': '12345678-1234-4234-8234-123456789abc', 'migration-from': range.from, 'migration-to': range.to, state: path.join(f.root, 'state.json'), [field]: field === 'commit' ? '0'.repeat(40) : sentinel };
      const result = run(f, 'remote-invariant-gate.mjs', ['capture', ...Object.entries(input).flatMap(([key, value]) => [`--${key}`, value])]);
      assert.equal(result.status, 1);
      const files = reports(f, 'remote-invariant-capture', 'tmp/data-reports/remote-invariants');
      for (const output of [...Object.values(files), result.stdout, result.stderr]) {
        assert.ok(!output.includes(sentinel));
        assert.ok(!output.includes('0'.repeat(40)));
      }
      assert.equal(existsSync(marker), false);
      const report = JSON.parse(files.json);
      assert.deepEqual(report.migrationRange, range);
      assert.equal(report.commit, field === 'commit' ? 'unknown' : f.commit);
      if (field !== 'commit') assert.equal(report.target[field === 'database-id' ? 'databaseId' : field], 'unknown');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('remote failures redact rejected metadata before any subprocess while retaining safe context', () => {
  const f = fixture();
  try {
    const sentinel = 'private.customer@example.test';
    const privateRange = '0024_private_customer_identifier.sql';
    const marker = path.join(f.root, 'subprocess-ran');
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)},'called');process.exit(99);\n`, { mode: 0o700 });
    const cases = [
      ['--commit', sentinel, '--database', sentinel, '--migration-from', privateRange, '--migration-to', privateRange],
      ['--commit', f.commit, '--database', sentinel, '--migration-from', range.from, '--migration-to', range.to],
      ['--commit', f.commit, '--database', 'serp-checklists-rehearsal-fixture', '--migration-from', privateRange, '--migration-to', privateRange],
      ['--commit', f.commit, '--database', 'serp-checklists-rehearsal-fixture', '--migration-from', 'none', '--migration-to', 'none', '--comparison-kind', sentinel],
    ];
    for (const args of cases) {
      const result = run(f, 'remote-invariant-gate.mjs', ['capture', '--state', path.join(f.root, 'state.json'), '--environment', 'rehearsal', '--binding', 'DB', '--database-id', '12345678-1234-4234-8234-123456789abc', ...args]);
      assert.equal(result.status, 1);
      const files = reports(f, 'remote-invariant-capture', 'tmp/data-reports/remote-invariants');
      for (const output of [...Object.values(files), result.stdout, result.stderr]) {
        assert.ok(!output.includes(sentinel));
        assert.ok(!output.includes(privateRange));
        assert.ok(output.includes('rehearsal') || output === '');
      }
      assert.equal(existsSync(marker), false);
      const report = JSON.parse(files.json);
      assert.equal(report.commit, args[1] === sentinel ? 'unknown' : f.commit);
      assert.deepEqual(report.migrationRange, args.includes(privateRange) ? { from: 'invalid', to: 'invalid' } : args.includes('none') ? { from: null, to: null } : range);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('remote CLI early failures print unknown identity without inventing a target or reviewed range', () => {
  const f = fixture();
  try {
    const result = run(f, 'remote-invariant-gate.mjs', ['capture']);
    assert.equal(result.status, 1);
    identity(reports(f, 'remote-invariant-capture', 'tmp/data-reports/remote-invariants'), {
      commit: 'unknown', target: { environment: 'unknown', binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown' },
      migrationRange: { from: 'invalid', to: 'invalid' },
    }, 'fail');
    const xml = reports(f, 'remote-invariant-capture', 'tmp/data-reports/remote-invariants')['junit.xml'];
    for (const field of ['commit', 'environment', 'binding', 'database', 'databaseId']) assert.ok(xml.includes(`name="${field}" value="unknown"`));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('remote comparison CLI preserves supplied identity and range on a missing state failure', () => {
  const f = fixture();
  try {
    const target = { environment: 'rehearsal', binding: 'DB', databaseName: 'serp-checklists-rehearsal-fixture', databaseId: '12345678-1234-4234-8234-123456789abc' };
    const result = run(f, 'remote-invariant-gate.mjs', ['compare', '--state', path.join(f.root, 'missing.json'), '--commit', f.commit, '--environment', target.environment, '--binding', target.binding, '--database', target.databaseName, '--database-id', target.databaseId, '--migration-from', range.from, '--migration-to', range.to]);
    assert.equal(result.status, 1);
    identity(reports(f, 'remote-invariant-comparison', 'tmp/data-reports/remote-invariants'), { commit: f.commit, target, migrationRange: range }, 'fail');
    for (const value of [f.commit, ...Object.values(target), ...Object.values(range)]) assert.ok(result.stderr.includes(value));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('remote capture CLI prints the reviewed range with complete identity using fixture transport', () => {
  const f = fixture();
  try {
    const target = { environment: 'rehearsal', binding: 'DB', databaseName: 'serp-checklists-rehearsal-fixture', databaseId: '12345678-1234-4234-8234-123456789abc' };
    writeFileSync(path.join(f.root, 'bin/pnpm'), `#!${node}
const args=process.argv.slice(2);
if(args[0]!=='exec'||args[1]!=='wrangler') process.exit(99);
if(args.includes('info')) console.log(JSON.stringify({name:'serp-checklists-rehearsal-fixture',uuid:'12345678-1234-4234-8234-123456789abc'}));
else {
  const sql=args[args.indexOf('--command')+1];
  const rows=sql==='SELECT id, name FROM d1_migrations ORDER BY id'?[{id:1,name:'0001_initial_schema.sql'}]:args.includes('--file')?[{invariant:'users',total_rows:0}]:[];
  console.log(JSON.stringify([{results:rows}]));
}
`, { mode: 0o700 });
    f.env.INVARIANT_HMAC_KEY = 'synthetic-fixture-key-'.repeat(3);
    const args = ['capture', '--state', path.join(f.root, 'state.json'), '--commit', f.commit, '--environment', target.environment, '--binding', target.binding, '--database', target.databaseName, '--database-id', target.databaseId];
    for (const migrationRange of [range, { from: null, to: null }]) {
      const result = run(f, 'remote-invariant-gate.mjs', [...args, '--migration-from', migrationRange.from ?? 'none', '--migration-to', migrationRange.to ?? 'none']);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      identity(reports(f, 'remote-invariant-capture', 'tmp/data-reports/remote-invariants'), { commit: f.commit, target, migrationRange }, 'pass');
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('provenance CLI does not invent commit or an empty range when repository evidence is unavailable', () => {
  const f = fixture();
  try {
    rmSync(path.join(f.root, '.git'), { recursive: true });
    rmSync(path.join(f.root, 'db/migration-provenance.json'));
    const result = run(f, 'check-migration-provenance.mjs');
    assert.equal(result.status, 1);
    identity(reports(f, 'migration-provenance'), {
      commit: 'unknown', target: { environment: 'local', binding: 'not-applicable:repository-history', databaseName: 'repository-migration-history', databaseId: 'git:db/migrations' },
      migrationRange: { from: 'unknown', to: 'unknown' },
    }, 'fail');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('provenance CLI identifies repository history on pass and rejected base', () => {
  const f = fixture();
  try {
    const expected = { commit: f.commit, target: { environment: 'local', binding: 'not-applicable:repository-history', databaseName: 'repository-migration-history', databaseId: 'git:db/migrations' }, migrationRange: range };
    const pass = run(f, 'check-migration-provenance.mjs', ['--base', f.commit]);
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    identity(reports(f, 'migration-provenance'), expected, 'pass');
    const fail = run(f, 'check-migration-provenance.mjs', ['--base', 'missing-fixture-base']);
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);
    identity(reports(f, 'migration-provenance'), expected, 'fail');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema CLI preserves known replay identity when validation fails before migration discovery', () => {
  const f = fixture();
  try {
    f.env.GITHUB_ACTIONS = 'true';
    const result = run(f, 'check-schema-contract.ts');
    assert.equal(result.status, 1);
    identity(reports(f, 'schema-contract'), {
      commit: f.commit,
      target: { environment: 'local', binding: 'not-applicable:in-memory', databaseName: 'fresh-migration-replay', databaseId: 'local:ephemeral', mode: 'local' },
      migrationRange: { from: 'unknown', to: 'unknown' },
    }, 'fail');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('schema CLI reports complete in-memory identity on pass and catalog mismatch', () => {
  const f = fixture();
  try {
    const expected = { commit: f.commit, target: { environment: 'local', binding: 'not-applicable:in-memory', databaseName: 'fresh-migration-replay', databaseId: 'local:ephemeral' }, migrationRange: range };
    const pass = run(f, 'check-schema-contract.ts');
    assert.equal(pass.status, 0, pass.stdout + pass.stderr);
    identity(reports(f, 'schema-contract'), expected, 'pass');
    writeFileSync(path.join(f.root, 'db/schema.sql'), '\nCREATE TABLE unexpected_fixture(id INTEGER);\n', { flag: 'a' });
    const fail = run(f, 'check-schema-contract.ts');
    assert.equal(fail.status, 1, fail.stdout + fail.stderr);
    identity(reports(f, 'schema-contract'), expected, 'fail');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
