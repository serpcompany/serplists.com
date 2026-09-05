import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, replayMigrations } from './schema-contract.ts';

const root = resolve('.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const databaseId = '11111111-1111-4111-8111-111111111111';
const invariantDatabase = 'serp-checklists-rehearsal-diagnostics';
const secretTable = 'PRIVATE_TABLE_SENTINEL_118';
const markers = [secretTable, 'PRIVATE_VALUE_SENTINEL_118', 'PRIVATE_OWNER_SENTINEL_118', 'STDERR_SECRET_SENTINEL_118', 'STDOUT_SECRET_SENTINEL_118', 'STATE_PATH_SENTINEL_118', 'INVARIANT_KEY_SENTINEL_118_', 'unknown_ledger_sentinel_128.sql', 'data-safety-fixture-user-v1', 'data-safety-fixture-template-v1', 'data-safety-fixture-run-v1'];
const expectPrivateFree = text => { for (const marker of markers) expect(text.toLowerCase()).not.toContain(marker.toLowerCase()); };

function fixture(failure) {
  const directory = mkdtempSync(join(tmpdir(), 'direct-data-diagnostics-'));
  const databaseFile = join(directory, 'local.sqlite');
  const db = replayMigrations();
  try {
    db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)');
    listMigrationFiles().forEach((migration, index) => insert.run(index + 1, migration.name));
    db.exec(readFileSync('scripts/data/sql/deterministic-fixtures.sql', 'utf8'));
    db.exec(`VACUUM INTO '${databaseFile.replaceAll("'", "''")}'`);
  } finally { db.close(); }
  const calls = join(directory, 'calls.jsonl');
  const stub = join(directory, 'pnpm');
  writeFileSync(stub, `#!${process.execPath}
const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite');
const args=process.argv.slice(2); const sql=args.includes('--command') ? args[args.indexOf('--command')+1] : args.includes('--file') ? fs.readFileSync(args[args.indexOf('--file')+1],'utf8') : '';
const identity=args.includes('info'); const inventory=sql.startsWith('SELECT name FROM sqlite_schema');
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({identity,inventory,privateArgument:sql.includes(${JSON.stringify(secretTable)}),domainQuery:sql.startsWith('SELECT * FROM')})+'\\n');
if(identity){console.log(JSON.stringify({name:args[args.indexOf('info')+1]===${JSON.stringify(invariantDatabase)}?${JSON.stringify(invariantDatabase)}:'fixture-db',uuid:${JSON.stringify(databaseId)}}));process.exit(0);}
if(${JSON.stringify(failure)}==='unknown-ledger' && sql.includes('SELECT id, name FROM d1_migrations')){console.log(JSON.stringify([{results:[{id:1,name:'0001_initial_schema.sql'},{id:2,name:'9999_unknown_ledger_sentinel_128.sql'}]}]));process.exit(0);}
if(${JSON.stringify(failure)}==='schema' && inventory){console.log(JSON.stringify([{results:[{name:${JSON.stringify(secretTable)}}]}]));process.exit(0);}
if((${JSON.stringify(failure)}==='schema' && sql.includes(${JSON.stringify(secretTable)})) || (${JSON.stringify(failure)}==='invariant' && sql.includes("SELECT 'template' kind"))) {
process.stdout.write(${JSON.stringify(markers.join(' '))});process.stderr.write(${JSON.stringify(markers.join(' '))});process.exit(31);}
const db=new DatabaseSync(${JSON.stringify(databaseFile)},{readOnly:true});
try{const results=sql.split(';').map(s=>s.replace(/^\\s*--.*$/gm,'').trim()).filter(Boolean).map(s=>({results:db.prepare(s).all()}));
if(${JSON.stringify(failure)}==='schema-drift') for(const entry of results) for(const row of entry.results) if(Object.hasOwn(row,'dflt_value') && row.name==='title') { row.dflt_value="'PRIVATE_VALUE_SENTINEL_118'"; row.default_is_null=0; }
console.log(JSON.stringify(results));}finally{db.close();}
`);
  chmodSync(stub, 0o700);
  return { directory, calls, state: join(directory, 'STATE_PATH_SENTINEL_118.json'), reports: join(directory, 'reports') };
}

function run(f, kind, mode = 'capture') {
  const args = kind === 'schema'
    ? ['--import', 'tsx', 'scripts/data/check-d1-schema.ts', '--database', 'fixture-db', '--database-id', databaseId, '--label', 'staging', '--report-dir', f.reports]
    : ['scripts/data/remote-invariant-gate.mjs', mode, '--database', invariantDatabase, '--database-id', databaseId, '--environment', 'rehearsal', '--binding', 'DB', '--commit', commit, '--migration-from', 'none', '--migration-to', 'none', '--state', f.state, '--report-dir', f.reports];
  return spawnSync(process.execPath, args, { cwd: root, env: { PATH: `${f.directory}:${process.env.PATH}`, HOME: process.env.HOME, CI: '1', INVARIANT_HMAC_KEY: 'INVARIANT_KEY_SENTINEL_118_'.repeat(3) }, encoding: 'utf8', timeout: 20_000 });
}

function reportFiles(f) { return readdirSync(f.reports).map(name => readFileSync(join(f.reports, name), 'utf8')); }

describe.skipIf(process.platform === 'win32')('direct schema and invariant CLI privacy', () => {
  it.each(['schema', 'invariant'])('redacts %s transport arguments and stdout/stderr and stops later reads', kind => {
    const f = fixture(kind);
    try {
      const result = run(f, kind);
      expect(result.status, result.stderr).toBe(1);
      const contents = [...reportFiles(f), result.stdout, result.stderr];
      for (const text of contents) expectPrivateFree(text);
      const file = kind === 'schema' ? 'd1-schema-staging.json' : 'remote-invariant-capture.json';
      const report = JSON.parse(readFileSync(join(f.reports, file), 'utf8'));
      expect(report).toMatchObject({ verdict: 'fail', commit, failedStage: `${kind}-query`, exitStatus: 31 });
      expect(report.target.databaseId).toBe(databaseId);
      expect(report.migrationRange).toBeDefined();
      for (const text of reportFiles(f)) for (const context of [commit, databaseId, kind === 'schema' ? 'fixture-db' : invariantDatabase]) expect(text).toContain(context);
      expect(readFileSync(join(f.reports, file.replace('.json', '.junit.xml')), 'utf8')).toMatch(/failures="[1-9][0-9]*"/);
      const calls = readFileSync(f.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls[0].identity).toBe(true);
      expect(calls.at(-1).identity).toBe(false);
      expect(calls.some(call => call.domainQuery)).toBe(false);
      if (kind === 'schema') expect(calls.at(-1).privateArgument).toBe(true);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });

  it.each(['schema', 'invariant'])('keeps successful %s behavior on the replayed database', kind => {
    const f = fixture(null);
    try {
      for (const mode of kind === 'schema' ? ['capture'] : ['capture', 'compare']) {
        const result = run(f, kind, mode);
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
      for (const file of kind === 'schema' ? ['d1-schema-staging.json'] : ['remote-invariant-capture.json', 'remote-invariant-comparison.json']) expect(JSON.parse(readFileSync(join(f.reports, file), 'utf8')).verdict).toBe('pass');
      for (const text of reportFiles(f)) expectPrivateFree(text);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });

  it('does not retain private SQL defaults from an otherwise successful remote schema response', () => {
    const f = fixture('schema-drift');
    try {
      const result = run(f, 'schema');
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(join(f.reports, 'd1-schema-staging.json'), 'utf8'));
      expect(report.schemaDifferences.runtime.verdict).toBe('fail');
      expect(report.schemaDifferences.runtime.differenceCount).toBeGreaterThan(0);
      for (const text of [...reportFiles(f), result.stdout, result.stderr]) expectPrivateFree(text);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });

  it('fails an unknown invariant ledger without retaining the provider migration text in reports, state, or console', () => {
    const f = fixture('unknown-ledger');
    try {
      const result = run(f, 'invariant');
      expect(result.status).toBe(1);
      expect(existsSync(f.state)).toBe(false);
      for (const text of [...reportFiles(f), result.stdout, result.stderr]) expectPrivateFree(text);
      const report = JSON.parse(readFileSync(join(f.reports, 'remote-invariant-capture.json'), 'utf8'));
      expect(report).toMatchObject({ verdict: 'fail', failedStage: 'invariant-query', ledger: { status: 'drift', observedCount: 2, knownCount: 1, unknownCount: 1, applied: ['0001_initial_schema.sql'], appliedThrough: '0001_initial_schema.sql' } });
      expect(report.ledger.sha256).toMatch(/^[0-9a-f]{64}$/);
      const calls = readFileSync(f.calls, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls).toHaveLength(2);
      expect(calls.map(call => call.identity)).toEqual([true, false]);
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  });
});
