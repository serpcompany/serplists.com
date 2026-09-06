import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, replayMigrations } from './schema-contract.ts';

const root = resolve('.');
const commit = '1'.repeat(40);
const sourceName = 'serp-checklists-rehearsal-export-probe';
const sourceId = '11111111-1111-4111-8111-111111111111';
const recoveryName = 'serp-checklists-rehearsal-restore-probe';
const recoveryId = '22222222-2222-4222-8222-222222222222';
const sentinels = ['PRIVATE_STDOUT_128', 'PRIVATE_STDERR_128', 'PRIVATE_SQL_128', 'PRIVATE_RANGE_128', 'PRIVATE_METADATA_128'];
const workflow = yaml.load(readFileSync(join(root, '.github/workflows/data-migration-rehearsal.yml'), 'utf8'));
const step = workflow.jobs.rehearsal.steps.find(step => step.name === 'Restore data-bearing export into separate recovery database and verify invariants');

function fixture(mode) {
  const cwd = mkdtempSync(join(tmpdir(), 'rehearsal-export-workflow-'));
  for (const entry of ['scripts/data', 'db/migrations', 'wrangler.toml']) cpSync(join(root, entry), join(cwd, entry), { recursive: true });
  symlinkSync(join(root, 'src'), join(cwd, 'src'));
  symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  for (const command of ['mkdir', 'chmod', 'rm']) symlinkSync(['/bin', '/usr/bin'].map(dir => join(dir, command)).find(existsSync), join(bin, command));
  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(join(bin, 'git'), `#!/bin/bash\n[[ "$1 $2" == "rev-parse HEAD" ]] || exit 99\nprintf '%s\\n' '${commit}'\n`, { mode: 0o700 });
  const db = replayMigrations();
  let dump;
  try {
    db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO d1_migrations VALUES(?,?)');
    listMigrationFiles().forEach((migration, index) => insert.run(index + 1, migration.name));
    db.exec(`CREATE TABLE export_probe(value TEXT, payload BLOB); INSERT INTO export_probe VALUES('PRIVATE_SQL_128',X'00ff'); CREATE VIEW export_probe_view AS SELECT value FROM export_probe;`);
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    const statements = ['PRAGMA defer_foreign_keys=TRUE;'];
    for (const table of db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name='sqlite_sequence', rowid").all()) {
      statements.push(table.name === 'sqlite_sequence' ? 'DELETE FROM sqlite_sequence;' : table.sql + ';');
      const columns = db.prepare(`PRAGMA table_info(${quote(table.name)})`).all();
      for (const row of db.prepare(`SELECT ${columns.map((column, index) => `quote(${quote(column.name)}) AS c${index}`).join(',')} FROM ${quote(table.name)}`).all()) statements.push(`INSERT INTO ${quote(table.name)} VALUES(${Object.values(row).join(',')});`);
    }
    for (const object of db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('index','trigger','view') ORDER BY type").all()) statements.push(object.sql + ';');
    dump = statements.join('\n') + '\n';
    db.exec(`VACUUM INTO '${join(cwd, 'source.sqlite').replaceAll("'", "''")}'`);
  } finally { db.close(); }
  writeFileSync(join(cwd, 'approved.sql'), dump);
  const reports = join(cwd, 'tmp/data-reports/rehearsal');
  mkdirSync(reports, { recursive: true });
  writeFileSync(join(reports, 'recovery-creation.json'), JSON.stringify({ schemaVersion: 1, verdict: 'pass', commit, runId: '128', createdAt: new Date().toISOString(), target: { environment: 'rehearsal', binding: 'DB', databaseName: recoveryName, databaseId: recoveryId } }));
  writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs'); const {DatabaseSync} = require('node:sqlite');
const cwd = ${JSON.stringify(cwd)}, mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2), action = args[3], name = args[4];
fs.appendFileSync(cwd+'/calls.jsonl', JSON.stringify({action,name})+'\\n');
if(args.slice(0,3).join(' ') !== 'exec wrangler d1') process.exit(99);
if(action === 'info') {
 const countPath=cwd+'/identity-count'; const count=fs.existsSync(countPath)?Number(fs.readFileSync(countPath)):0;
 fs.writeFileSync(countPath,String(count+1));
 // Capture and the explicit before-identify precede the export's own checks.
 const mismatch=(mode==='before-mismatch' && count>=5) || (mode==='after-mismatch' && fs.existsSync(cwd+'/exported'));
 console.log(JSON.stringify({name,uuid:mismatch?'33333333-3333-4333-8333-333333333333':name===${JSON.stringify(sourceName)}?${JSON.stringify(sourceId)}:${JSON.stringify(recoveryId)}})); process.exit(0);
}
if(action === 'export') {
 if(args.includes('--no-schema') || args.includes('--no-data') || !args.includes('--remote')) process.exit(98);
 const output=args[args.indexOf('--output')+1];
 fs.writeFileSync(output, fs.readFileSync(cwd+'/approved.sql'));
 fs.writeFileSync(cwd+'/exported',JSON.stringify({bytesMatch:fs.readFileSync(output).equals(fs.readFileSync(cwd+'/approved.sql')),mode:fs.statSync(output).mode&511,directoryMode:fs.statSync(require('node:path').dirname(output)).mode&511}));
 process.stdout.write('PRIVATE_STDOUT_128 PRIVATE_SQL_128'); process.stderr.write('PRIVATE_STDERR_128 PRIVATE_SQL_128');
 process.exit(mode==='failure'?23:0);
}
if(action !== 'execute') process.exit(99);
const db=new DatabaseSync(cwd+(name===${JSON.stringify(sourceName)}?'/source.sqlite':'/recovery.sqlite'));
try {
 if(args.includes('--file') && args[args.indexOf('--file')+1].includes('/scripts/data/sql/')) { const sql=fs.readFileSync(args[args.indexOf('--file')+1],'utf8'); db.exec(sql); console.log(JSON.stringify([{success:true,meta:{},results:[{'Total queries executed':1,'Rows read':0,'Rows written':0,'Database size (MB)':'0.00'}]}])); }
 else if(args.includes('--file')) { fs.writeFileSync(cwd+'/restore-started','yes'); db.exec(fs.readFileSync(args[args.indexOf('--file')+1],'utf8')); console.log('PRIVATE_STDOUT_128'); }
 else { const sql=args.find(arg=>arg.startsWith('--command='))?.slice('--command='.length) ?? args[args.indexOf('--command')+1]; console.log(JSON.stringify(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>({success:true,meta:{},results:db.prepare(s).all()})))); }
} finally {db.close();}
`, { mode: 0o700 });
  return { cwd, reports, env: { PATH: bin, CI: '1', DATABASE_NAME: sourceName, DATABASE_ID: sourceId, RECOVERY_DATABASE_NAME: recoveryName, RECOVERY_DATABASE_ID: recoveryId, GITHUB_SHA: commit, GITHUB_RUN_ID: '128', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'serpcompany/serplists.com', GITHUB_REF_PROTECTED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', DATA_PROMOTION_WORKFLOW: 'data-promotion', DATA_PROTECTED_ENVIRONMENT: 'staging', DATA_APPROVER_IDENTITY: '@devinschumacher', MIGRATION_FROM: 'none', MIGRATION_TO: 'none', INVARIANT_HMAC_KEY: 'synthetic-export-key-128-'.repeat(3) } };
}

function run(f, body = step.run) {
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body], { cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 30_000 });
}
function publicContents(f, result) {
  return [result.stdout, result.stderr, ...readdirSync(f.reports, { recursive: true }).map(name => join(f.reports, name)).filter(file => statSync(file).isFile()).map(file => readFileSync(file, 'utf8'))];
}
function assertPrivateFree(f, result) {
  for (const content of publicContents(f, result)) expect(sentinels.some(marker => content.toLowerCase().includes(marker.toLowerCase())), 'provider streams and SQL must not reach public diagnostics').toBe(false);
}
function assertReportedRange(f, range) {
  const reportRoot = join(f.reports, 'recovery/recovery-export');
  expect(JSON.parse(readFileSync(`${reportRoot}.json`, 'utf8')).migrationRange).toEqual(range);
  const junit = readFileSync(`${reportRoot}.junit.xml`, 'utf8');
  expect(junit).toContain(`<property name="migrationFrom" value="${range.from ?? 'none'}"/>`);
  expect(junit).toContain(`<property name="migrationTo" value="${range.to ?? 'none'}"/>`);
  for (const extension of ['txt', 'md']) expect(readFileSync(`${reportRoot}.${extension}`, 'utf8')).toContain(`migration=${JSON.stringify(range)}`);
}
function assertEarlyTarget(f, target = { environment: 'rehearsal', binding: 'DB', databaseName: sourceName, databaseId: sourceId }) {
  const prefix = join(f.reports, 'recovery/recovery-export');
  const report = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
  expect(report.target).toEqual(target);
  expect(report.targetIdentitySource).toBe(target.databaseId === 'unknown' ? 'unknown' : 'locally-validated-request');
  expect(report.remoteIdentity).toBeNull();
  const junit = readFileSync(`${prefix}.junit.xml`, 'utf8');
  expect(junit).toContain(`targetIdentitySource=${report.targetIdentitySource}`);
  expect(junit).toContain('remoteIdentity=null');
  for (const [property, value] of Object.entries({ environment: target.environment, binding: target.binding, database: target.databaseName, databaseId: target.databaseId })) expect(junit).toContain(`<property name="${property}" value="${value}"/>`);
  for (const extension of ['txt', 'md']) {
    const text = readFileSync(`${prefix}.${extension}`, 'utf8');
    expect(text).toContain(`target=${JSON.stringify(target)}`);
    expect(text).toContain(`targetIdentitySource=${report.targetIdentitySource}`);
    expect(text).toContain('remoteIdentity=null');
  }
}

describe('rehearsal full export through the actual workflow shell and fixture provider transport', () => {
  it.each(['none', '0024_safe_template_evolution.sql'])('suppresses both failure streams, retains exit 23, cleans plaintext, and prevents restore and comparison (%s)', endpoint => {
    const f = fixture('failure');
    f.env.MIGRATION_FROM = f.env.MIGRATION_TO = endpoint;
    try {
      const laterSteps = workflow.jobs.rehearsal.steps.slice(workflow.jobs.rehearsal.steps.indexOf(step) + 1).filter(later => later.run && !later.if);
      for (const guarded of [step, ...laterSteps]) expect(guarded['continue-on-error']).toBeUndefined();
      // Execute the actual remaining ordinary run bodies too: bash -e must
      // never reach any of them after export failure. Always-teardown is separate.
      const result = run(f, [step.run, ...laterSteps.map(later => later.run)].join('\n'));
      expect(result.status, result.stderr).toBe(23);
      assertPrivateFree(f, result);
      assertReportedRange(f, { from: endpoint === 'none' ? null : endpoint, to: endpoint === 'none' ? null : endpoint });
      expect(existsSync(join(f.cwd, 'restore-started'))).toBe(false);
      expect(existsSync(join(f.reports, 'recovery/remote-invariant-comparison.json'))).toBe(false);
      expect(existsSync(join(f.cwd, 'tmp/rehearsal-sensitive/recovery.sql'))).toBe(false);
      const calls = readFileSync(join(f.cwd, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      expect(calls.at(-1)).toEqual({ action: 'export', name: sourceName });
      expect(calls.some(call => call.name === recoveryName)).toBe(false);
      const report = JSON.parse(readFileSync(join(f.reports, 'recovery/recovery-export.json'), 'utf8'));
      expect(report).toMatchObject({ verdict: 'fail', failedStage: 'data-export', exitStatus: 23, target: { databaseName: sourceName, databaseId: sourceId } });
      expect(readFileSync(join(f.reports, 'recovery/recovery-export.junit.xml'), 'utf8')).toContain('failures="1"');
      for (const extension of ['json', 'junit.xml', 'txt', 'md']) {
        const content = readFileSync(join(f.reports, `recovery/recovery-export.${extension}`), 'utf8');
        for (const diagnostic of [commit, sourceId, 'data-export', 'CANARY_SUBPROCESS_FAILED', extension === 'json' ? '"exitStatus": 23' : 'exitStatus=23']) expect(content).toContain(diagnostic);
      }
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['none', '0024_safe_template_evolution.sql'])('exports the complete approved SQL bytes privately, then restores, compares, and removes plaintext (%s)', endpoint => {
    const f = fixture('success');
    f.env.MIGRATION_FROM = f.env.MIGRATION_TO = endpoint;
    try {
      const result = run(f);
      expect(result.status, result.stderr).toBe(0);
      assertReportedRange(f, { from: endpoint === 'none' ? null : endpoint, to: endpoint === 'none' ? null : endpoint });
      expect(JSON.parse(readFileSync(join(f.cwd, 'exported'), 'utf8'))).toEqual({ bytesMatch: true, mode: 0o600, directoryMode: 0o700 });
      const exported = JSON.parse(readFileSync(join(f.reports, 'recovery/recovery-export.json'), 'utf8'));
      expect(exported).toMatchObject({ verdict: 'pass', target: { environment: 'rehearsal', binding: 'DB', databaseName: sourceName, databaseId: sourceId } });
      expect(exported.targetIdentitySource).toBe('locally-validated-request');
      expect(exported.remoteIdentity).toEqual({ databaseName: sourceName, databaseId: sourceId });
      expect(exported.export.bytes).toBe(readFileSync(join(f.cwd, 'approved.sql')).length);
      expect(JSON.parse(readFileSync(join(f.reports, 'recovery/recovery-import.json'), 'utf8')).verdict).toBe('pass');
      expect(JSON.parse(readFileSync(join(f.reports, 'recovery/remote-invariant-comparison.json'), 'utf8'))).toMatchObject({ verdict: 'pass', fullRecovery: { verdict: 'pass' } });
      const calls = readFileSync(join(f.cwd, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      const exportIndex = calls.findIndex(call => call.action === 'export');
      expect(calls.slice(exportIndex - 1, exportIndex + 2)).toEqual([{ action: 'info', name: sourceName }, { action: 'export', name: sourceName }, { action: 'info', name: sourceName }]);
      expect(calls.findIndex(call => call.name === recoveryName)).toBeGreaterThan(exportIndex + 1);
      expect(existsSync(join(f.cwd, 'tmp/rehearsal-sensitive/recovery.sql'))).toBe(false);
      expect(readdirSync(join(f.cwd, 'tmp/rehearsal-sensitive'))).toEqual([]);
      assertPrivateFree(f, result);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['before-mismatch', 'after-mismatch'])('%s stops the workflow at the export identity boundary', mode => {
    const f = fixture(mode);
    try {
      const result = run(f);
      expect(result.status).toBe(1);
      expect(existsSync(join(f.cwd, 'exported'))).toBe(mode === 'after-mismatch');
      expect(existsSync(join(f.cwd, 'restore-started'))).toBe(false);
      expect(existsSync(join(f.reports, 'recovery/remote-invariant-comparison.json'))).toBe(false);
      expect(existsSync(join(f.cwd, 'tmp/rehearsal-sensitive/recovery.sql'))).toBe(false);
      expect(JSON.parse(readFileSync(join(f.reports, 'recovery/recovery-export.json'), 'utf8'))).toMatchObject({ verdict: 'fail', failedStage: 'data-identity', target: { databaseId: sourceId } });
      assertEarlyTarget(f);
      assertReportedRange(f, { from: null, to: null });
      assertPrivateFree(f, result);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['partial-failure', 'existing-file', 'missing-workflow', 'wrong-confirmation', 'production', 'outside-path', 'symlink-directory'])('the workflow export command fails closed for %s without relying on its shell trap', mode => {
    const f = fixture(mode === 'partial-failure' ? 'failure' : 'success');
    try {
      let command = step.run.split('\n').find(line => line.includes('--output tmp/rehearsal-sensitive/recovery.sql'));
      const directory = join(f.cwd, 'tmp/rehearsal-sensitive');
      const file = join(directory, 'recovery.sql');
      if (mode === 'symlink-directory') {
        mkdirSync(join(f.cwd, 'elsewhere'));
        symlinkSync(join(f.cwd, 'elsewhere'), directory);
      } else mkdirSync(directory, { mode: 0o700 });
      if (mode === 'existing-file') writeFileSync(file, 'previous-owned-export', { mode: 0o600 });
      if (mode === 'missing-workflow') delete f.env.GITHUB_ACTIONS;
      if (mode === 'wrong-confirmation') command = command.replace('--confirm-database-id "$DATABASE_ID"', '--confirm-database-id "$RECOVERY_DATABASE_ID"');
      if (mode === 'production') {
        const inventory = JSON.parse(readFileSync(join(root, 'scripts/data/environment-inventory.json'), 'utf8'));
        f.env.DATABASE_NAME = inventory.environments.production.databaseName;
        f.env.DATABASE_ID = inventory.environments.production.databaseId;
        command = command.replace('--environment rehearsal', '--environment production');
      }
      if (mode === 'outside-path') command = command.replace('tmp/rehearsal-sensitive/recovery.sql', 'tmp/public.sql');
      const result = run(f, command);
      expect(result.status).toBe(mode === 'partial-failure' ? 23 : 1);
      expect(existsSync(file)).toBe(mode === 'existing-file');
      if (mode === 'existing-file') expect(readFileSync(file, 'utf8')).toBe('previous-owned-export');
      if (mode !== 'partial-failure') expect(existsSync(join(f.cwd, 'calls.jsonl'))).toBe(false);
      expect(existsSync(join(f.cwd, 'tmp/public.sql'))).toBe(false);
      assertReportedRange(f, mode === 'missing-workflow' ? { from: 'invalid', to: 'invalid' } : { from: null, to: null });
      if (['outside-path', 'wrong-confirmation', 'missing-workflow'].includes(mode)) assertEarlyTarget(f);
      assertPrivateFree(f, result);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['missing-from', 'missing-to', 'missing-both', 'malformed', 'unknown', 'reversed', 'half-none', 'range-mismatch', 'none-mismatch', 'missing-workflow-range', 'invalid-workflow-range'])('rejects %s before any provider call or plaintext change using the workflow export command', mode => {
    const f = fixture('success');
    try {
      let command = step.run.split('\n').find(line => line.includes('--output tmp/rehearsal-sensitive/recovery.sql'));
      const file = join(f.cwd, 'tmp/rehearsal-sensitive/recovery.sql');
      mkdirSync(join(f.cwd, 'tmp/rehearsal-sensitive'), { mode: 0o700 });
      if (mode === 'missing-from' || mode === 'missing-both') command = command.replace('--migration-from "$MIGRATION_FROM"', '');
      if (mode === 'missing-to' || mode === 'missing-both') command = command.replace('--migration-to "$MIGRATION_TO"', '');
      if (mode === 'malformed') f.env.MIGRATION_FROM = f.env.MIGRATION_TO = 'PRIVATE_RANGE_128';
      if (mode === 'unknown') f.env.MIGRATION_FROM = f.env.MIGRATION_TO = '9999_private_range_128.sql';
      if (mode === 'reversed') { f.env.MIGRATION_FROM = '0024_safe_template_evolution.sql'; f.env.MIGRATION_TO = '0023_add_sitemap_revision_state.sql'; }
      if (mode === 'half-none') f.env.MIGRATION_TO = '0024_safe_template_evolution.sql';
      if (mode === 'range-mismatch' || mode === 'none-mismatch') {
        f.env.MIGRATION_FROM = f.env.MIGRATION_TO = '0024_safe_template_evolution.sql';
        const substituted = mode === 'none-mismatch' ? 'none' : '0023_add_sitemap_revision_state.sql';
        command = command.replace('"$MIGRATION_FROM"', substituted).replace('"$MIGRATION_TO"', substituted);
      }
      if (mode === 'missing-workflow-range' || mode === 'invalid-workflow-range') {
        command = command.replace('"$MIGRATION_FROM"', 'none').replace('"$MIGRATION_TO"', 'none');
        if (mode === 'missing-workflow-range') { delete f.env.MIGRATION_FROM; delete f.env.MIGRATION_TO; }
        else f.env.MIGRATION_FROM = f.env.MIGRATION_TO = 'PRIVATE_RANGE_128';
      }
      const result = run(f, command);
      expect(result.status).toBe(1);
      expect(existsSync(join(f.cwd, 'calls.jsonl')), 'range rejection must precede even identity provider reads').toBe(false);
      expect(existsSync(file)).toBe(false);
      assertEarlyTarget(f);
      const expectedRange = ['range-mismatch', 'none-mismatch'].includes(mode)
        ? { from: '0024_safe_template_evolution.sql', to: '0024_safe_template_evolution.sql' }
        : mode.startsWith('missing-') && mode !== 'missing-workflow-range' ? { from: null, to: null }
        : { from: 'invalid', to: 'invalid' };
      assertReportedRange(f, expectedRange);
      assertPrivateFree(f, result);
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);

  it.each(['cli-range', 'missing-cli-endpoint', 'cli-parser', 'database-name', 'database-id', 'missing-name', 'missing-id', 'environment', 'binding', 'cli-approver', 'workflow-repository', 'workflow-commit', 'workflow-owner', 'workflow-protection'])('reports only locally validated context for early %s failure, without remote observations', mode => {
    const f = fixture('success');
    try {
      f.env.MIGRATION_FROM = f.env.MIGRATION_TO = '0024_safe_template_evolution.sql';
      let command = step.run.split('\n').find(line => line.includes('--output tmp/rehearsal-sensitive/recovery.sql'));
      const target = { environment: 'rehearsal', binding: 'DB', databaseName: sourceName, databaseId: sourceId };
      if (mode === 'cli-range') command = command.replace('"$MIGRATION_FROM"', 'PRIVATE_RANGE_128');
      if (mode === 'missing-cli-endpoint') command = command.replace('--migration-to "$MIGRATION_TO"', '');
      if (mode === 'cli-parser') command = command.replace('rehearsal-recovery-export ', 'rehearsal-recovery-export PRIVATE_METADATA_128 ');
      if (mode === 'database-name') f.env.DATABASE_NAME = 'PRIVATE_METADATA_128';
      if (mode === 'database-id') f.env.DATABASE_ID = 'PRIVATE_METADATA_128';
      if (mode === 'missing-name') command = command.replace('--database-name "$DATABASE_NAME"', '');
      if (mode === 'missing-id') command = command.replace('--database-id "$DATABASE_ID"', '');
      if (mode === 'environment') { command = command.replace('--environment rehearsal', '--environment PRIVATE_METADATA_128'); target.environment = 'unknown'; }
      if (mode === 'binding') { command += ' --binding PRIVATE_METADATA_128'; target.binding = 'unknown'; }
      if (['database-name', 'database-id', 'missing-name', 'missing-id', 'environment', 'binding'].includes(mode)) target.databaseName = target.databaseId = 'unknown';
      if (mode === 'cli-approver') command = command.replace('--approver-identity @devinschumacher', '--approver-identity PRIVATE_METADATA_128');
      if (mode === 'workflow-repository') f.env.GITHUB_REPOSITORY = 'PRIVATE_METADATA_128';
      if (mode === 'workflow-commit') f.env.GITHUB_SHA = 'PRIVATE_METADATA_128';
      if (mode === 'workflow-owner') f.env.DATA_APPROVER_IDENTITY = 'PRIVATE_METADATA_128';
      if (mode === 'workflow-protection') f.env.GITHUB_REF_PROTECTED = 'false';
      const result = run(f, command);
      expect(result.status).toBe(1);
      expect(existsSync(join(f.cwd, 'calls.jsonl'))).toBe(false);
      expect(existsSync(join(f.cwd, 'tmp/rehearsal-sensitive/recovery.sql'))).toBe(false);
      assertEarlyTarget(f, target);
      assertReportedRange(f, mode.startsWith('workflow-') ? { from: 'invalid', to: 'invalid' } : { from: '0024_safe_template_evolution.sql', to: '0024_safe_template_evolution.sql' });
      assertPrivateFree(f, result);
      const logged = JSON.parse(result.stderr.trim().split('\n').find(line => line.startsWith('{')));
      expect(logged.target).toEqual(target);
      expect(logged.remoteIdentity).toBeNull();
    } finally { rmSync(f.cwd, { recursive: true, force: true }); }
  }, 30_000);
});
