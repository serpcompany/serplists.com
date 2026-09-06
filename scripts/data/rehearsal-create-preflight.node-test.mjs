import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runDataCommand } from './data-command-lib.mjs';
import { writeDataCheckReports } from './reporting.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const commit = 'a'.repeat(40);
const name = 'serp-checklists-rehearsal-bounded155';
const uuid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const secret = 'PRIVATE_PROVIDER_DETAIL_155';
const response = `database_name = "${name}"\ndatabase_id = "${uuid}"`;
function fixture(t) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'creation155-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'scripts/data'), { recursive: true });
  mkdirSync(path.join(dir, 'db'), { recursive: true });
  for (const file of ['wrangler.toml', 'scripts/data/environment-inventory.json']) cpSync(path.join(root, file), path.join(dir, file));
  cpSync(path.join(root, 'db/migrations'), path.join(dir, 'db/migrations'), { recursive: true });
  const evidence = path.join(dir, 'tmp/data-reports/create.json');
  const calls = []; let context;
  const invoke = (overrides = {}, provider = command => command.includes('create') ? response : JSON.stringify({ name, uuid })) => runDataCommand({
    argv: ['rehearsal-create', '--database-name', name, '--evidence', evidence, '--execute'],
    repoRoot: dir, gitCommit: commit, env: { GITHUB_RUN_ID: '155' }, now: new Date('2026-09-06T00:00:00Z'),
    write: () => {}, onReportContext: value => { context = structuredClone(value); },
    runCommand: command => { calls.push(command); return provider(command); }, ...overrides,
  });
  return { dir, evidence, calls, invoke, context: () => context };
}

for (const invalid of ['missing-evidence', 'bare-evidence', 'outside', 'root-directory', 'existing', 'symlink', 'parent-symlink', 'parent-file', 'nul-path', 'missing-run', 'malformed-run', 'missing-commit', 'malformed-commit', 'sha-mismatch', 'invalid-date', 'invalid-expected', 'duplicate-evidence', 'protected-expected']) {
  test(`preflight ${invalid}: zero provider calls`, t => {
    const f = fixture(t); const options = {};
    const args = ['rehearsal-create', '--database-name', name, '--execute'];
    let destination = f.evidence;
    if (invalid === 'outside') destination = path.join(f.dir, 'outside.json');
    if (invalid === 'root-directory') destination = path.join(f.dir, 'tmp/data-reports');
    if (invalid === 'nul-path') destination += '\0';
    if (invalid === 'parent-file') writeFileSync(path.join(f.dir, 'tmp'), secret);
    if (invalid === 'parent-symlink') {
      mkdirSync(path.join(f.dir, 'outside'));
      symlinkSync(path.join(f.dir, 'outside'), path.join(f.dir, 'tmp'));
    }
    if (['existing', 'symlink'].includes(invalid)) {
      mkdirSync(path.dirname(f.evidence), { recursive: true });
      writeFileSync(path.join(f.dir, 'sentinel'), secret);
      if (invalid === 'existing') writeFileSync(f.evidence, secret);
      else symlinkSync(path.join(f.dir, 'sentinel'), f.evidence);
    }
    if (invalid !== 'missing-evidence') args.push('--evidence');
    if (!['missing-evidence', 'bare-evidence'].includes(invalid)) args.push(destination);
    if (invalid === 'duplicate-evidence') args.push('--evidence', destination);
    if (invalid === 'missing-run') options.env = {};
    if (invalid === 'malformed-run') options.env = { GITHUB_RUN_ID: secret };
    if (invalid === 'missing-commit') options.gitCommit = undefined;
    if (invalid === 'malformed-commit') options.gitCommit = secret;
    if (invalid === 'sha-mismatch') options.env = { GITHUB_RUN_ID: '155', GITHUB_SHA: 'b'.repeat(40) };
    if (invalid === 'invalid-date') options.now = new Date('invalid');
    if (invalid === 'invalid-expected') args.push('--expected-database-id', secret);
    if (invalid === 'protected-expected') args.push('--expected-database-id', 'FCAF4325-5BE7-4EAD-AB60-45932A04177B');
    const diagnostics = [];
    assert.throws(() => f.invoke({ ...options, argv: args, write: value => diagnostics.push(value) }));
    assert.equal(f.calls.length, 0);
    assert.ok(!diagnostics.join('\n').includes(secret));
    if (invalid === 'existing') assert.equal(readFileSync(f.evidence, 'utf8'), secret);
  });
}

for (const mode of ['create-failure', 'malformed-create', 'unrelated-uuid', 'protected-uuid', 'uppercase-protected', 'wrong-name', 'ambiguous-json', 'duplicate-json', 'info-failure', 'info-mismatch', 'info-malformed', 'info-text', 'info-contradiction', 'early-persistence-failure', 'persistence-failure', 'expected-mismatch', 'healthy', 'healthy-json', 'healthy-array']) {
  test(`creation receipt: ${mode}`, t => {
    const f = fixture(t);
    const provider = command => {
      if (command.includes('create')) {
        if (mode === 'create-failure') throw Object.assign(new Error(secret), { status: 31, stdout: secret });
        if (mode === 'malformed-create') return secret;
        if (mode === 'unrelated-uuid') return `request ${uuid} ${secret}`;
        if (mode === 'protected-uuid') return response.replace(uuid, 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1');
        if (mode === 'uppercase-protected') return response.replace(uuid, 'B62CCC0A-9C69-4828-9E9B-3BAC6BA0E4F1');
        if (mode === 'wrong-name') return response.replace(name, `${name}-wrong`);
        if (mode === 'ambiguous-json') return JSON.stringify({ name, uuid, database_id: other });
        if (mode === 'duplicate-json') return `{"name":"${name}","uuid":"${other}","uuid":"${uuid}"}`;
        if (mode === 'early-persistence-failure') { rmSync(f.evidence); mkdirSync(f.evidence); }
        if (mode === 'healthy-json') return JSON.stringify({ name, uuid, private: secret });
        return response;
      }
      if (mode === 'info-failure') throw Object.assign(new Error(secret), { status: 32 });
      if (mode === 'info-malformed') return secret;
      if (mode === 'info-text') return response;
      if (mode === 'info-contradiction') return JSON.stringify({ name, uuid, success: true, errors: [{ message: secret }] });
      if (mode === 'healthy-array') return JSON.stringify([{ name, uuid, success: true, errors: [] }]);
      if (mode === 'persistence-failure') { rmSync(f.evidence); mkdirSync(f.evidence); }
      return JSON.stringify({ name, uuid: mode === 'info-mismatch' ? other : uuid, private: secret });
    };
    const options = mode === 'expected-mismatch' ? { argv: ['rehearsal-create', '--database-name', name, '--evidence', f.evidence, '--expected-database-id', other, '--execute'] } : {};
    if (mode.startsWith('healthy')) {
      f.invoke(options, provider);
      const receipt = JSON.parse(readFileSync(f.evidence, 'utf8'));
      assert.equal(receipt.verdict, 'pass');
      assert.equal(receipt.target.databaseId, uuid);
      assert.deepEqual(receipt.remoteIdentity, { databaseName: name, databaseId: uuid });
      assert.deepEqual(receipt.creationResponse, receipt.remoteIdentity);
      assert.equal(receipt.commit, commit); assert.equal(receipt.runId, '155');
    } else {
      let failure;
      assert.throws(() => { try { f.invoke(options, provider); } catch (error) { failure = error; throw error; } });
      const receipt = f.context()?.creationReceipt;
      assert.ok(receipt, 'safe receipt survives the failure');
      assert.deepEqual(failure.creationReceipt, receipt);
      assert.equal(receipt.verdict, 'fail');
      assert.equal(receipt.remoteIdentity?.databaseId ?? null, mode === 'persistence-failure' ? uuid : null);
      const validResponse = !['create-failure', 'malformed-create', 'unrelated-uuid', 'protected-uuid', 'uppercase-protected', 'wrong-name', 'ambiguous-json', 'duplicate-json'].includes(mode);
      assert.equal(receipt.creationResponse?.databaseId ?? null, validResponse ? uuid : null);
      assert.equal(receipt.cleanup, 'requires-separate-authorization-and-identity-verification');
      const reports = writeDataCheckReports({ name: 'failure', reportDirectory: path.join(f.dir, 'rendered'), report: receipt, summary: JSON.stringify(receipt) });
      for (const file of Object.values(reports)) assert.ok(!readFileSync(file, 'utf8').includes(secret));
      if (!mode.includes('persistence-failure')) assert.equal(JSON.parse(readFileSync(f.evidence, 'utf8')).verdict, 'fail');
    }
    assert.ok(f.calls.every(call => !call.includes('delete')));
    assert.equal(f.calls.filter(call => call.includes('create')).length, 1);
  });
}

for (const mode of ['missing-evidence', 'create-failure', 'info-failure', 'info-contradiction', 'persistence-failure', 'healthy']) test(`actual CLI safe creation diagnostics: ${mode}`, t => {
  const f = fixture(t);
  cpSync(path.join(root, 'scripts/data/data-command.mjs'), path.join(f.dir, 'scripts/data/data-command.mjs'));
  for (const file of ['data-command-lib.mjs', 'git-subprocess-env.mjs', 'canary-diagnostics.mjs', 'reporting.mjs']) symlinkSync(path.join(root, 'scripts/data', file), path.join(f.dir, 'scripts/data', file));
  const preload = path.join(f.dir, 'fake-provider.mjs');
  const calls = path.join(f.dir, 'calls.jsonl');
  writeFileSync(preload, `import cp from 'node:child_process'; import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const mode=${JSON.stringify(mode)};
cp.execFileSync = (cmd,args) => {
  if(cmd==='git') return '${commit}'; if(cmd!=='pnpm') throw new Error('Unexpected command');
  fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
  if(args.includes('create') && mode!=='create-failure') return ${JSON.stringify(response)};
  if(args.includes('info') && mode==='info-contradiction') return ${JSON.stringify(JSON.stringify({ name, uuid, success: true, errors: [{ message: secret }] }))};
  if(args.includes('info') && mode==='persistence-failure') { fs.rmSync(${JSON.stringify(f.evidence)}); fs.mkdirSync(${JSON.stringify(f.evidence)}); }
  if(args.includes('info') && mode!=='info-failure') return ${JSON.stringify(JSON.stringify({ name, uuid, private: secret }))};
  throw Object.assign(new Error('${secret}'),{status:32,stdout:'${secret}',stderr:'${secret}'});
}; syncBuiltinESMExports();`);
  const args = ['--import', preload, path.join(f.dir, 'scripts/data/data-command.mjs'), 'rehearsal-create', '--database-name', name, '--execute'];
  if (mode !== 'missing-evidence') args.push('--evidence', f.evidence);
  const result = spawnSync(process.execPath, args, { env: { PATH: '/usr/bin:/bin', GITHUB_RUN_ID: '155' }, encoding: 'utf8' });
  assert.equal(result.status, mode === 'healthy' ? 0 : 1);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
  if (mode === 'healthy') {
    assert.ok(result.stdout.includes(uuid));
    assert.equal(JSON.parse(readFileSync(f.evidence, 'utf8')).verdict, 'pass');
    return;
  }
  const report = JSON.parse(result.stderr);
  if (mode === 'missing-evidence') { assert.throws(() => readFileSync(calls)); return; }
  assert.ok(report.creationReceipt, result.stderr);
  assert.equal(report.creationReceipt.creationResponse?.databaseId ?? null, mode === 'create-failure' ? null : uuid);
  assert.equal(report.creationReceipt.remoteIdentity?.databaseId ?? null, mode === 'persistence-failure' ? uuid : null);
  assert.equal(report.failedStage, mode === 'create-failure' ? 'data-create' : mode.startsWith('info-') ? 'data-identity' : 'data-reporting');
  const files = writeDataCheckReports({ name: 'cli-failure', reportDirectory: path.join(f.dir, 'rendered'), report, summary: JSON.stringify(report) });
  for (const file of Object.values(files)) assert.ok(!readFileSync(file, 'utf8').includes(secret));
  assert.ok(!readFileSync(calls, 'utf8').includes('delete'));
});
