import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, replayMigrations } from './schema-contract.ts';

const production = ['serp-checklists-db', 'b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1'];
const staging = ['serp-checklists-staging-db', 'fcaf4325-5be7-4ead-ab60-45932a04177b'];
const rehearsal = ['serp-checklists-rehearsal-153', '11111111-1111-4111-8111-111111111111'];
const local = [production[0], 'local:miniflare:DB'];
const sentinel = 'PRIVATE_IDENTITY_SENTINEL_153';

function run(kind, label, target, flags = [], options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'direct-check-identity-'));
  const db = replayMigrations();
  try {
    db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    listMigrationFiles().forEach(({ name }, i) => db.prepare('INSERT INTO d1_migrations VALUES (?, ?)').run(i + 1, name));
    if (options.drift === 'schema') db.exec('ALTER TABLE users ADD COLUMN unexpected_column TEXT');
    if (options.drift === 'ledger') db.exec('DELETE FROM d1_migrations WHERE id = (SELECT MAX(id) FROM d1_migrations)');
    db.exec(`VACUUM INTO '${join(dir, 'db.sqlite').replaceAll("'", "''")}'`);
  } finally { db.close(); }
  writeFileSync(join(dir, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs'); const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(dir, 'calls'))}, JSON.stringify(args)+'\\n');
if(args.includes('info')) {
 const observations = fs.readFileSync(${JSON.stringify(join(dir, 'calls'))}, 'utf8').trim().split('\\n').map(JSON.parse).filter(a=>a.includes('info')).length;
 const identity = ${JSON.stringify(options.changeAt ?? 0)} > observations ? ${JSON.stringify(target)} : ${JSON.stringify(options.observed ?? target)};
 console.log(JSON.stringify({name:identity[0],uuid:identity[1]})); process.exit(0);
}
const db = new DatabaseSync(${JSON.stringify(join(dir, 'db.sqlite'))}, {readOnly:true});
if(args.includes('list')) {
 const applied = new Set(db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(r=>r.name));
 const missing = ${JSON.stringify(listMigrationFiles().map(m => m.name))}.filter(n=>!applied.has(n));
 console.log(missing.length ? 'Migrations to be applied:\\n┌────────────────────────────────────┐\\n'+missing.map(n=>'│ '+n+' │').join('\\n')+'\\n└────────────────────────────────────┘' : 'No migrations to apply!');
} else {
 const sql = args.find(a=>a.startsWith('--command='))?.slice(10) ?? args[args.indexOf('--command')+1];
 const statements = sql.split(';').map(s=>s.trim()).filter(Boolean);
 const envelopes = statements.map(s=>({success:true,meta:{duration:0},results:db.prepare(s).all()}));
 const poison = ${JSON.stringify(options.envelope ?? '')};
 const inventory = sql.startsWith('SELECT name FROM sqlite_schema');
 if (inventory && poison.startsWith('inventory-')) {
   if (poison === 'inventory-failed-tail') envelopes.push({success:false,meta:{},results:[]});
   if (poison === 'inventory-success-tail') envelopes.push({success:true,meta:{},results:[]});
   if (poison === 'inventory-missing-success') delete envelopes[0].success;
 }
 if (poison === 'failed-empty-fk') {
   const index = statements.findIndex((s,i)=>s.startsWith('PRAGMA foreign_key_list') && envelopes[i].results.length===0);
   if (index >= 0) envelopes[index].success = false;
 }
 if (!inventory && statements.length > 1 && poison.startsWith('catalog-')) {
   if (poison === 'catalog-missing-success') delete envelopes[0].success;
   if (poison === 'catalog-error') envelopes[0].error = null;
   if (poison === 'catalog-meta') envelopes[0].meta = [];
   if (poison === 'catalog-results') envelopes[0].results = {};
   if (poison === 'catalog-failed-tail') envelopes.push({success:false,meta:{},results:[]});
 }
 let output = JSON.stringify(envelopes);
 if (inventory && poison === 'inventory-duplicate-success') output = output.replace('"success":true', '"success":false,"success":true');
 if (!inventory && statements.length > 1 && poison === 'catalog-duplicate-success') output = output.replace('"success":true', '"success":false,"success":true');
 console.log(output);
}
db.close();
`, { mode: 0o700 });
  try {
    const args = [...(kind === 'schema' ? ['--import', 'tsx', 'scripts/data/check-d1-schema.ts'] : ['scripts/data/check-pending-migrations.mjs']), '--database', target[0], '--label', label, ...(target[1] === undefined ? [] : ['--database-id', target[1]]), ...flags, '--report-dir', join(dir, 'reports')];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 20000, env: { PATH: `${dir}:${process.env.PATH}`, HOME: dir, CI: '1' } });
    const calls = existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n').map(JSON.parse) : [];
    const artifacts = readdirSync(join(dir, 'reports')).map(n=>readFileSync(join(dir, 'reports', n), 'utf8'));
    const report = JSON.parse(artifacts.find(s=>s.startsWith('{')));
    return { ...result, calls, report, diagnostics: result.stdout + result.stderr + artifacts.join('\n') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe.each(['schema', 'pending'])('issue 153 actual %s CLI', kind => {
  const remote = ['--remote'];
  it('rejects a staging label on production before any provider call', () => {
    const result = run(kind, 'staging', production, remote);
    expect(result.calls).toEqual([]);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('PASS');
  });
  it.each([
    ['--remote=false'], ['--local=false'], ['--preview=false'], ['--env', 'production'],
    ['--label', 'production'], ['--database-id='], ['--persist-to'],
  ].map(flags => [flags]))('rejects ambiguous or unsupported arguments %j before transport', flags => {
    const result = run(kind, 'staging', staging, [...remote, ...flags]);
    expect(result.calls).toEqual([]);
    expect(result.status).toBe(1);
  });
  it.each([
    ['local', production, ['--local']], ['rehearsal', production, remote],
    ['staging', [staging[0], production[1]], remote], ['staging', [production[0], staging[1]], remote],
    ['production', staging, remote], ['production', [production[0]], remote],
    ['rehearsal', [rehearsal[0]], remote], ['rehearsal', [rehearsal[0], staging[1]], remote],
    ['local', local, remote], ['staging', staging, ['--local']],
    ['production', production, ['--local']], ['production', production, ['--remote', '--preview']],
    ['rehearsal', rehearsal, ['--remote', '--preview']], ['local', local, ['--local', '--preview']],
    ['staging', staging, ['--remote', '--local']], ['staging', staging, ['--remote', '--persist-to', 'state']],
    [sentinel, staging, remote], ['staging', [sentinel, staging[1]], remote],
    ['staging', staging, ['--remote', '--binding', sentinel]],
  ])('rejects invalid target %s %j %j without transport', (label, target, flags) => {
    const result = run(kind, label, target, flags);
    expect(result.calls).toEqual([]);
    expect(result.status).toBe(1);
    expect(result.diagnostics).not.toContain(sentinel);
  });
  it.each([
    ['local', local, ['--local']], ['local', [local[0]], ['--local']],
    ['local', local, ['--local', '--persist-to', 'state']], ['staging', staging, remote],
    ['staging', [staging[0]], remote], ['staging', staging, ['--remote', '--preview']],
    ['rehearsal', rehearsal, remote], ['production', production, remote],
  ])('compares healthy %s %j %j', (label, target, flags) => {
    const result = run(kind, label, target, flags, { observed: target[1] ? target : staging });
    expect(result.status, result.diagnostics).toBe(0);
    expect(result.report.verdict).toBe('pass');
    expect(result.report.target.environment).toBe(label);
    expect(result.report.target.databaseId).toBe(target[1] ?? (label === 'local' ? local[1] : staging[1]));
    expect(result.report.target.binding).toBe('DB');
    expect(result.calls.some(a=>a.includes(kind === 'schema' ? 'execute' : 'list'))).toBe(true);
    if (label === 'local') expect(result.calls.every(a=>a.includes('--local') && !a.includes('info'))).toBe(true);
    if (flags.includes('--preview')) expect(result.calls.every(a=>!a.includes('--preview'))).toBe(true);
    if (kind === 'schema') expect(result.report.ledger.verdict).toBe('pass');
  });
  it.each(kind === 'schema' ? ['schema', 'ledger'] : ['ledger'])('detects real %s drift after valid identity', drift => {
    const result = run(kind, 'staging', staging, remote, { drift });
    expect(result.status, result.diagnostics).toBe(1);
    expect(result.report.verdict).toBe('fail');
    expect(result.calls.some(a=>a.includes(kind === 'schema' ? 'execute' : 'list'))).toBe(true);
  });
  it.each([production, [staging[0], production[1]], [staging[0], rehearsal[1]], [sentinel, sentinel]].map(observed => [observed]))('rejects observed mismatch %j before queries', observed => {
    const result = run(kind, 'staging', [staging[0]], remote, { observed });
    expect(result.status).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toContain('info');
    expect(result.diagnostics).not.toContain(sentinel);
  });
  it.each([['staging', staging, 2], ['staging', staging, 3], ['production', production, 2], ['production', production, 3]])('blocks %s identity changes at observation %s %i', (label, target, changeAt) => {
    const result = run(kind, label, target, remote, { changeAt, observed: [target[0], rehearsal[1]] });
    expect(result.status).toBe(1);
    expect(result.report.verdict).toBe('fail');
    expect(result.stdout).not.toContain('PASS');
    expect(result.calls.filter(a=>!a.includes('info'))).toHaveLength(changeAt === 2 ? 0 : 1);
  });
});

describe('issue 154 actual schema CLI query envelopes', () => {
  it.each(['failed-empty-fk', 'inventory-failed-tail', 'inventory-success-tail', 'inventory-missing-success', 'inventory-duplicate-success',
    'catalog-missing-success', 'catalog-error', 'catalog-meta', 'catalog-results', 'catalog-failed-tail', 'catalog-duplicate-success'])('rejects %s before PASS', envelope => {
    const result = run('schema', 'local', local, ['--local'], { envelope });
    expect(result.status, result.diagnostics).toBe(1);
    expect(result.report.verdict).toBe('fail');
    expect(result.stdout).not.toContain('PASS');
    expect(result.calls.some(args => args.includes('execute'))).toBe(true);
  });
});
