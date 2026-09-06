import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateReportIdentity } from './report-identity-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const self = fileURLToPath(import.meta.url);
const commit = 'a'.repeat(40);
const base = 'b'.repeat(40);
const inventory = JSON.parse(readFileSync(path.join(root, 'scripts/data/environment-inventory.json'), 'utf8'));
const target = { environment: 'staging', binding: inventory.binding, ...inventory.environments.staging };
const files = readdirSync(path.join(root, 'db/migrations')).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
const last = files.at(-1);

// Preload only transport doubles into the real producer and its real plan child.
// No report, pending/ledger parser, plan resolver, or identity validator is replaced.
if (process.env.STAGING_CONTRACT_TRANSPORT === '1') {
  const exec = childProcess.execFileSync;
  const pending = process.env.STAGING_CONTRACT_RANGE === 'pending' ? [last] : [];
  let identityCalls = 0;
  childProcess.execFileSync = (command, args, options) => {
    if (command === 'git') {
      if (args[0] === 'merge-base') {
        if (process.env.STAGING_CONTRACT_FAILURE === 'base') throw new Error('PRIVATE_TRANSPORT_DETAIL');
        return '';
      }
      if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? commit : base;
      if (args[0] === 'diff') return pending.map(name => `db/migrations/${name}`).join('\n');
      if (args[0] === 'show') return readFileSync(path.join(root, args[1].split(':')[1]), 'utf8');
    }
    if (command === 'pnpm' || command === 'pnpm.cmd') {
      if (args[0] === 'run' && args[1] === 'check:data:migration-provenance') {
        if (process.env.STAGING_CONTRACT_FAILURE === 'provenance') throw new Error('PRIVATE_TRANSPORT_DETAIL');
        // External provenance command transport: synthetic artifacts, not provenance proof.
        for (const ext of ['json', 'junit.xml', 'md', 'txt']) writeFileSync(path.join(args[args.indexOf('--report-dir') + 1], `migration-provenance.${ext}`), 'synthetic provenance transport');
        return '';
      }
      if (args[3] === 'info') {
        identityCalls++;
        const bad = process.env.STAGING_CONTRACT_FAILURE === `identity-${identityCalls}`;
        return JSON.stringify({ name: target.databaseName, uuid: bad ? 'wrong-provider-id' : target.databaseId });
      }
      if (args[3] === 'migrations') return pending.length ? `Migrations to be applied:\n┌──┐\n│ ${last} │\n└──┘` : 'No migrations to apply!';
      if (args[3] === 'execute') {
        const applied = pending.length ? files.slice(0, -1) : [...files];
        if (process.env.STAGING_CONTRACT_FAILURE === 'ledger') applied.reverse();
        return JSON.stringify([{ success: true, meta: {}, results: applied.map((name, index) => ({ id: index + 1, name })) }]);
      }
    }
    if (command === process.execPath && args[0] === '--input-type=module') return exec(command, ['--import', self, ...args], options);
    throw new Error(`Unexpected transport: ${command} ${args.join(' ')}`);
  };
  syncBuiltinESMExports();
} else {
  function fixture(run) {
    const directory = mkdtempSync(path.join(tmpdir(), 'staging-range-contract-'));
    try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  function produce(directory, range, failure = '') {
    const result = childProcess.spawnSync(process.execPath, ['--import', self, path.join(root, 'scripts/data/check-staging-reviewed-range.mjs')], {
      cwd: directory, encoding: 'utf8', env: {
        STAGING_CONTRACT_TRANSPORT: '1', STAGING_CONTRACT_RANGE: range, STAGING_CONTRACT_FAILURE: failure,
        STAGING_BASE_SHA: base, GITHUB_SHA: commit, GITHUB_ENV: path.join(directory, 'github-env'), DATA_REPORT_DIR: path.join(directory, 'provenance'),
      },
    });
    const file = path.join(directory, 'tmp/data-reports/staging/staging-reviewed-range.json');
    return { result, file, report: JSON.parse(readFileSync(file, 'utf8')) };
  }
  for (const range of ['pending', 'none']) {
    test(`actual ${range} producer output passes deployment and finalizer identity consumer`, () => fixture(directory => {
      const { result, file, report } = produce(directory, range);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(report.verdict, 'pass');
      assert.equal(report.commit, commit);
      assert.equal(report.baseCommit, base);
      assert.deepEqual(report.pendingMigrations, range === 'pending' ? [last] : []);
      assert.deepEqual(report.ledger.before, range === 'pending' ? files.slice(0, -1) : files);
      const expected = { commit, target, migrationRange: { from: range === 'pending' ? last : null, to: range === 'pending' ? last : null } };
      // This is the exact shared consumer called on range evidence by the finalizer.
      assert.deepEqual(validateReportIdentity(report, expected), { ...expected, target: { environment: target.environment, binding: target.binding, databaseName: target.databaseName, databaseId: target.databaseId } });
      const raw = path.join(directory, 'deploy.log'); writeFileSync(raw, 'synthetic successful deployment transport');
      const deploy = (changes = {}) => {
        const flags = { '--environment': 'staging', '--binding': target.binding, '--database-name': target.databaseName, '--database-id': target.databaseId, '--commit': commit, '--tree': 'c'.repeat(40), '--outcome': 'success', '--raw-output': raw, '--reviewed-evidence': file, '--report-dir': path.join(directory, 'deploy'), ...changes };
        return childProcess.spawnSync(process.execPath, [path.join(root, 'scripts/data/record-deployment.mjs'), ...Object.entries(flags).flat()], { cwd: directory, env: {}, encoding: 'utf8' });
      };
      assert.equal(deploy().status, 0);
      for (const changes of [{ '--commit': base }, { '--binding': 'OTHER' }, { '--database-id': 'wrong-id' }, { '--database-name': 'wrong-name' }, { '--environment': 'production' }, { '--migration-from': range === 'pending' ? 'none' : last, '--migration-to': range === 'pending' ? 'none' : last }]) assert.equal(deploy(changes).status, 1, JSON.stringify(changes));
      for (const key of ['binding', 'databaseName', 'databaseId', 'environment']) {
        const changed = structuredClone(report); changed.target[key] = 'mismatch';
        assert.throws(() => validateReportIdentity(changed, expected));
      }
      const missing = structuredClone(report); delete missing.target.binding;
      assert.throws(() => validateReportIdentity(missing, expected));
      assert.throws(() => validateReportIdentity({ ...report, commit: base }, expected));
      assert.throws(() => validateReportIdentity({ ...report, migrationRange: { from: range === 'pending' ? null : last, to: range === 'pending' ? null : last } }, expected));
      assert.match(readFileSync(file.replace('.json', '.junit.xml'), 'utf8'), /name="binding" value="DB"/);
      assert.equal(readFileSync(path.join(directory, 'github-env'), 'utf8'), `MIGRATION_FROM=${range === 'pending' ? last : 'none'}\nMIGRATION_TO=${range === 'pending' ? last : 'none'}\n`);
    }));
  }
  for (const failure of ['base', 'provenance', 'identity-1', 'identity-2', 'identity-3', 'ledger']) {
    test(`producer retains ${failure} rejection and private failure handling`, () => fixture(directory => {
      const { result, report, file } = produce(directory, 'pending', failure);
      assert.equal(result.status, 1);
      assert.equal(report.verdict, 'fail');
      assert.equal(existsSync(path.join(directory, 'github-env')), false);
      for (const ext of ['json', 'junit.xml', 'md', 'txt']) assert.doesNotMatch(readFileSync(file.replace('.json', `.${ext}`), 'utf8'), /PRIVATE_TRANSPORT_DETAIL/);
      assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_TRANSPORT_DETAIL/);
    }));
  }
}
