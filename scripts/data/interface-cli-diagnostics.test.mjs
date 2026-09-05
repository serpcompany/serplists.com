import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sentinel = 'PRIVATE_CUSTOMER_TOKEN_STDOUT_STDERR_ARGV_CAUSE_134';
const stagingId = 'fcaf4325-5be7-4ead-ab60-45932a04177b';
const rehearsalId = '11111111-1111-4111-8111-111111111111';
const bookmark = '00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';

function fixture() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'interface-cli-')));
  symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  for (const entry of ['scripts', 'db', 'wrangler.toml']) cpSync(path.join(root, entry), path.join(dir, entry), { recursive: true });
  mkdirSync(path.join(dir, 'bin'));
  writeFileSync(path.join(dir, 'bin/git'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');
if(process.argv[2]===process.env.FAIL_GIT){process.stdout.write(${JSON.stringify(sentinel)});process.stderr.write(${JSON.stringify(sentinel)});process.exit(31);}
const r=spawnSync('/usr/bin/git',['-C',${JSON.stringify(root)},...process.argv.slice(2)],{encoding:'utf8'});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
`, { mode: 0o700 });
  writeFileSync(path.join(dir, 'bin/pnpm'), `#!${process.execPath}
const fs=require('node:fs');const a=process.argv.slice(2);const calls='calls.jsonl';
const originalLog=console.log;
console.log=value=>{
if(process.env.BAD_RESULT){try{const p=JSON.parse(value);const rows=(Array.isArray(p)?p:[p]).flatMap(x=>x.results||[]);if(rows.some(row=>row.invariant)){
if(process.env.BAD_RESULT==='missing')rows.pop();
else if(process.env.BAD_RESULT==='name')rows[0].invariant=${JSON.stringify(sentinel)};
else if(process.env.BAD_RESULT==='count')rows[0].total_rows=${JSON.stringify(sentinel)};
value=JSON.stringify([{results:rows}]);
}else if(p.bookmark){p.bookmark=${JSON.stringify(sentinel)};value=JSON.stringify(p);}}catch{}}
if(process.env.CONTAMINATE==='true'){
try{const p=JSON.parse(value);for(const item of Array.isArray(p)?p:[p]){item.private=${JSON.stringify(sentinel)};for(const row of item.results||[])row.private=${JSON.stringify(sentinel)};}value=JSON.stringify(p);}
catch{value=${JSON.stringify(sentinel)}+'\\n'+value;}
}
originalLog(value);
};
const n=fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\\n').length+1:1;
fs.appendFileSync(calls,JSON.stringify(a)+'\\n');
process.stderr.write(${JSON.stringify(sentinel)});
if(a[0]==='run'){
const dir=a[a.indexOf('--report-dir')+1];fs.mkdirSync(dir,{recursive:true});
for(const suffix of ['json','junit.xml','md','txt'])fs.writeFileSync(require('node:path').join(dir,'migration-provenance.'+suffix),n===Number(process.env.FAIL_AT)?${JSON.stringify(sentinel)}:'safe successful provenance');
}
if(n===Number(process.env.FAIL_AT)){process.stdout.write(${JSON.stringify(sentinel)});process.stderr.write(${JSON.stringify(sentinel)});process.exit(31);}
if(n===Number(process.env.MALFORMED_AT)){console.log(${JSON.stringify(sentinel)});process.exit(0);}
if(a[0]==='run'){process.exit(0);}
if(a.includes('time-travel')){console.log(JSON.stringify({bookmark:${JSON.stringify(bookmark)}}));process.exit(0);}
if(a.includes('info')){console.log(JSON.stringify({name:process.env.DB_NAME,uuid:process.env.DB_ID}));process.exit(0);}
if(a.includes('create')){console.log(${JSON.stringify(sentinel)}+' '+process.env.DB_ID);process.exit(0);}
if(a.includes('list')){console.log('No migrations to apply!');process.exit(0);}
if(a.some(v=>v.includes('SELECT id, name FROM d1_migrations'))){console.log(JSON.stringify([{results:fs.readdirSync('db/migrations').filter(n=>/^\\d{4}_[a-z0-9_]+\\.sql$/.test(n)).sort().map((name,i)=>({id:i+1,name}))}]));process.exit(0);}
if(a.some(v=>v.includes('total_objects'))){console.log(JSON.stringify([{results:[{total_objects:0}]}]));process.exit(0);}
if(a.includes('export')){fs.writeFileSync(a[a.indexOf('--output')+1],'CREATE TABLE example(id TEXT);');}
if(a.includes('--file')&&a.some(v=>v.includes('capture-invariants'))){const sql=fs.readFileSync(a[a.indexOf('--file')+1],'utf8');console.log(JSON.stringify([{results:[...sql.matchAll(/SELECT '([^']+)' AS invariant/g)].map(m=>({invariant:m[1],total_rows:0}))}]));process.exit(0);}
if(a.includes('--file')&&a.some(v=>v.includes('fixture'))){const teardown=a.some(v=>v.includes('teardown'));const counts=JSON.parse(fs.readFileSync('scripts/data/fixture-inventory.json','utf8')).expectedCounts;console.log(JSON.stringify([{results:[['users','users'],['templates','templates'],['checklist_runs','checklistRuns']].map(([name,key])=>({fixture_table:name,fixture_rows:teardown?0:counts[key]}))}]));process.exit(0);}
console.log(JSON.stringify([{results:[]}]));
`, { mode: 0o700 });
  mkdirSync(path.join(dir, 'tmp/data-reports'), { recursive: true });
  mkdirSync(path.join(dir, 'tmp/rehearsal-sensitive'), { recursive: true });
  writeFileSync(path.join(dir, 'tmp/rehearsal-sensitive/input.sql'), 'PRAGMA defer_foreign_keys=TRUE; CREATE TABLE users(id TEXT PRIMARY KEY);');
  writeFileSync(path.join(dir, 'tmp/data-reports/creation.json'), JSON.stringify({ schemaVersion: 1, verdict: 'pass', commit, runId: '123', createdAt: new Date().toISOString(), target: { environment: 'rehearsal', binding: 'DB', databaseName: 'serp-checklists-rehearsal-134', databaseId: rehearsalId } }));
  return dir;
}

function run(dir, operation, failAt, malformedAt, overrides = {}) {
  const rehearsal = ['recovery-restore', 'rehearsal-create', 'rehearsal-teardown'].includes(operation);
  const args = operation === 'reviewed' ? ['scripts/data/check-staging-reviewed-range.mjs'] : ['scripts/data/data-command.mjs', operation, '--environment', overrides.LOCAL === 'true' ? 'local' : rehearsal ? 'rehearsal' : 'staging', '--confirm-database-id', rehearsal ? rehearsalId : stagingId, '--execute',
    ...(rehearsal ? ['--database-name', 'serp-checklists-rehearsal-134', '--database-id', rehearsalId, '--approver-identity', '@devinschumacher', '--creation-evidence', 'tmp/data-reports/creation.json', '--input', path.join(dir, 'tmp/rehearsal-sensitive/input.sql'), '--evidence', 'tmp/data-reports/created.json'] : []),
    ...(operation === 'export' ? ['--output', `tmp/data-evidence/${failAt ? sentinel : 'export'}.sql`] : [])];
  return spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 20000, env: {
    PATH: `${dir}/bin:${process.env.PATH}`, HOME: dir, FAIL_AT: String(failAt ?? ''), MALFORMED_AT: String(malformedAt ?? ''),
    DB_NAME: rehearsal ? 'serp-checklists-rehearsal-134' : 'serp-checklists-staging-db', DB_ID: rehearsal ? rehearsalId : stagingId,
    GITHUB_SHA: commit, STAGING_BASE_SHA: commit, GITHUB_ENV: path.join(dir, 'github-env'), GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'serpcompany/serplists.com', GITHUB_REF_PROTECTED: 'true', GITHUB_EVENT_NAME: rehearsal ? 'workflow_dispatch' : 'push', GITHUB_REF: 'refs/heads/staging', GITHUB_RUN_ID: '123', DATA_PROMOTION_WORKFLOW: 'data-promotion', DATA_PROTECTED_ENVIRONMENT: 'staging', DATA_APPROVER_IDENTITY: '@devinschumacher',
    ...overrides,
  } });
}

function artifacts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? artifacts(path.join(dir, entry.name)) : [readFileSync(path.join(dir, entry.name), 'utf8')]).join('\n');
}

describe('issue 134 direct interface CLI diagnostics (fake subprocess transport only)', () => {
  it.each(['local', 'staging'])('does not publish successful %s migration command chatter as evidence', environment => {
    const dir = fixture();
    try {
      const result = run(dir, 'migration-apply', undefined, environment === 'local' ? 1 : 2, { LOCAL: String(environment === 'local') });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      expect(result.stdout).toContain('command-completed');
      expect(result.stdout).toContain('separate-verification-required');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['identify', 'migration-ledger', 'invariant-capture', 'recovery-bookmark', 'export', 'recovery-restore', 'rehearsal-create', 'rehearsal-teardown', 'fixture-setup', 'fixture-teardown'])('projects only approved successful %s evidence fields', operation => {
    const dir = fixture();
    try {
      const result = run(dir, operation, undefined, undefined, { CONTAMINATE: 'true' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      expect(result.stdout).toContain(commit);
      if (operation === 'recovery-bookmark') expect(result.stdout).toContain(bookmark);
      if (operation === 'invariant-capture') expect(result.stdout).toContain('templates_invalid_json');
      if (operation === 'migration-ledger') expect(result.stdout).toContain('pendingMigrations');
      if (operation === 'export') expect(result.stdout).toContain('sha256');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([['invariant-capture', 'missing'], ['invariant-capture', 'name'], ['invariant-capture', 'count'], ['recovery-bookmark', 'bookmark']])('rejects successful %s with invalid %s proof', (operation, kind) => {
    const dir = fixture();
    try {
      const result = run(dir, operation, undefined, undefined, { BAD_RESULT: kind });
      expect(result.status, result.stdout).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      expect(existsSync(path.join(dir, 'github-env'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  for (const [operation, count] of [['reviewed', 6], ['migration-ledger', 3], ['migration-apply', 3], ['invariant-capture', 9], ['recovery-bookmark', 3], ['export', 3], ['recovery-restore', 6]]) {
    it.each(Array.from({ length: count }, (_, i) => i + 1))(`${operation} stops and redacts failed subprocess %i`, failAt => {
      const dir = fixture();
      try {
        const result = run(dir, operation, failAt);
        expect(result.status, result.stdout + result.stderr).toBe(1);
        expect(existsSync(path.join(dir, 'calls.jsonl')), result.stderr).toBe(true);
        expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
        expect(readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n'), result.stderr).toHaveLength(failAt);
        expect(readdirSync(dir)).not.toContain('github-env');
        expect(result.stderr).toContain('31');
        expect(result.stderr).toContain(commit);
        expect(result.stderr).toContain(operation === 'recovery-restore' ? rehearsalId : stagingId);
        if (operation === 'reviewed') {
          const firstCall = JSON.parse(readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').split('\n')[0]);
          expect(existsSync(firstCall[firstCall.indexOf('--report-dir') + 1])).toBe(false);
          const reports = path.join(dir, 'tmp/data-reports/staging');
          expect(JSON.parse(readFileSync(path.join(reports, 'staging-reviewed-range.json'), 'utf8'))).toMatchObject({ verdict: 'fail', commit, exitStatus: 31 });
          for (const name of readdirSync(reports)) {
            const content = readFileSync(path.join(reports, name), 'utf8');
            expect(content).toContain(commit);
            expect(content).toContain(stagingId);
            expect(content).toContain('staging-range-');
          }
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
  it('does not write raw creation output before post-create identity validation fails', () => {
    const dir = fixture();
    try {
      const result = run(dir, 'rehearsal-create', 2);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([['reviewed', 2], ['reviewed', 3], ['reviewed', 5], ['identify', 2], ['migration-ledger', 2], ['invariant-capture', 2], ['invariant-capture', 5], ['invariant-capture', 8], ['recovery-bookmark', 2], ['fixture-setup', 2], ['fixture-teardown', 2], ['export', 2], ['recovery-restore', 2], ['rehearsal-create', 2]])('redacts malformed successful provider output for %s at %i', (operation, at) => {
    const dir = fixture();
    try {
      const result = run(dir, operation, undefined, at);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      // Result validation follows the existing post-command identity check.
      const calls = readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      expect(calls.length).toBeLessThanOrEqual(at + 1);
      if (calls.length > at) expect(calls.at(-1)).toContain('info');
      expect(existsSync(path.join(dir, 'github-env'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['reviewed', 'migration-ledger', 'migration-apply', 'invariant-capture', 'recovery-bookmark', 'export', 'recovery-restore', 'rehearsal-create'])('preserves successful %s structured results', operation => {
    const dir = fixture();
    try {
      const result = run(dir, operation);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      if (operation === 'reviewed') {
        expect(readFileSync(path.join(dir, 'tmp/data-reports/staging-reviewed-range/migration-provenance.json'), 'utf8')).toBe('safe successful provenance');
        expect(JSON.parse(readFileSync(path.join(dir, 'tmp/data-reports/staging/staging-reviewed-range.json'), 'utf8'))).toMatchObject({ verdict: 'pass', commit, pendingMigrations: [] });
        expect(readFileSync(path.join(dir, 'github-env'), 'utf8')).toBe('MIGRATION_FROM=none\nMIGRATION_TO=none\n');
      } else {
        expect(result.stdout).toContain(commit);
        if (operation === 'recovery-bookmark') expect(result.stdout).toContain(bookmark);
        if (operation === 'recovery-restore') expect(result.stdout).toContain('preparedPlaintextCleanup');
        if (operation === 'rehearsal-create') expect(result.stdout).toContain('createdIdentity');
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('contains a failure in the failure-report writer without printing its private filesystem error', () => {
    const dir = fixture();
    try {
      writeFileSync(path.join(dir, 'tmp/data-reports/staging'), sentinel);
      const result = run(dir, 'reviewed', 1);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      expect(result.stderr).not.toContain('Error:');
      expect(result.stderr).toContain('publication failed');
      expect(existsSync(path.join(dir, 'github-env'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('does not echo invalid commit environment values', () => {
    const dir = fixture();
    try {
      const result = run(dir, 'reviewed', undefined, undefined, { GITHUB_SHA: sentinel, STAGING_BASE_SHA: sentinel });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      expect(existsSync(path.join(dir, 'calls.jsonl'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('turns environment-publication failure into failed reports without a passing environment write', () => {
    const dir = fixture();
    try {
      mkdirSync(path.join(dir, 'github-env'));
      const result = run(dir, 'reviewed');
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('PASS');
      expect(readdirSync(path.join(dir, 'github-env'))).toEqual([]);
      expect(JSON.parse(readFileSync(path.join(dir, 'tmp/data-reports/staging/staging-reviewed-range.json'), 'utf8'))).toMatchObject({ verdict: 'fail', failedStage: 'staging-range-reporting' });
      expect(result.stderr).not.toContain('EISDIR');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([['migration-ledger', 'rev-parse'], ['reviewed', 'diff']])('contains nested Git diagnostics for %s', (operation, command) => {
    const dir = fixture();
    try {
      const result = run(dir, operation, undefined, undefined, { FAIL_GIT: command });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      expect(existsSync(path.join(dir, 'github-env'))).toBe(false);
      if (operation === 'reviewed') {
        expect(readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
        expect(result.stderr).toContain('staging-range-plan');
      } else expect(existsSync(path.join(dir, 'calls.jsonl'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('suppresses unsafe argument-validation errors before any operation', () => {
    const dir = fixture();
    try {
      const result = run(dir, sentinel);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(sentinel);
      expect(result.stderr).toContain('data-configuration');
      expect(existsSync(path.join(dir, 'calls.jsonl'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(['reviewed', 'migration-ledger'])('does not retain mismatched provider identity in %s diagnostics', operation => {
    const dir = fixture();
    try {
      const result = run(dir, operation, undefined, undefined, { DB_NAME: sentinel });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr + artifacts(path.join(dir, 'tmp/data-reports'))).not.toContain(sentinel);
      expect(result.stderr).toContain('identity');
      expect(readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n')).toHaveLength(operation === 'reviewed' ? 2 : 1);
      expect(existsSync(path.join(dir, 'github-env'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
