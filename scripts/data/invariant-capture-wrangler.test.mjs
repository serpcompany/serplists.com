import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { captureRemoteInvariantSnapshot, compareProductionInvariants } from './invariant-capture-lib.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const wrangler = path.join(repoRoot, 'node_modules/wrangler/bin/wrangler.js');
const migrationDirectory = path.join(repoRoot, 'db/migrations');
const evolution = '0024_safe_template_evolution.sql';
const compare = (pre, post) => compareProductionInvariants({ pre:pre.invariants, post:post.invariants,
  preDomain:pre.domain, postDomain:post.domain, preHasEvolution:pre.hasEvolution, postHasEvolution:post.hasEvolution });

// Real pinned Wrangler, real local D1, no provider/transport replacement. Only
// the capture adapter's --remote destination is replaced with owned --local state.
const yielding = operation => async (...args) => {
  await setImmediate();
  try { return operation(...args); }
  finally { await setImmediate(); }
};

async function localDatabase(pre0024 = false) {
  expect(JSON.parse(readFileSync(path.join(repoRoot, 'node_modules/wrangler/package.json'), 'utf8')).version).toBe('4.54.0');
  const directory = mkdtempSync(path.join(tmpdir(), 'serplists-owned-wrangler-capture-'));
  const migrations = path.join(directory, 'migrations');
  mkdirSync(migrations);
  for (const name of readdirSync(migrationDirectory).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))) {
    if (!pre0024 || name.slice(0, 4) < evolution.slice(0, 4)) copyFileSync(path.join(migrationDirectory, name), path.join(migrations, name));
  }
  const config = path.join(directory, 'wrangler.toml');
  writeFileSync(config, 'name = "invariant-local-proof"\ncompatibility_date = "2024-09-23"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "invariant-local-proof"\ndatabase_id = "11111111-1111-4111-8111-111111111111"\nmigrations_dir = "migrations"\n');
  const run = args => {
    if (args.includes('--remote') || args[0] !== 'd1' || !args.includes('--local')) throw new Error('Real invariant test permits only local D1 commands.');
    return execFileSync(process.execPath, [wrangler, ...args, '--config', config, '--persist-to', path.join(directory, 'state')], {
      cwd:directory, encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:90000, maxBuffer:16 * 1024 * 1024,
      env:{ PATH:path.dirname(process.execPath), CI:'1', WRANGLER_SEND_METRICS:'false',
        XDG_CONFIG_HOME:path.join(directory, 'config'), WRANGLER_LOG_PATH:path.join(directory, 'wrangler.log') },
    });
  };
  const apply = () => run(['d1','migrations','apply','invariant-local-proof','--local']);
  const execute = sql => run(['d1','execute','invariant-local-proof','--local','--json',`--command=${sql}`]);
  const capture = () => captureRemoteInvariantSnapshot({ database:'invariant-local-proof', repoRoot,
    key:'synthetic-real-local-capture-key-151', runWrangler:args => run([...args.filter(arg => arg !== '--remote'), '--local']) });
  const close = () => rmSync(directory, {recursive:true, force:true});
  try { await yielding(apply)(); } catch (error) { close(); throw error; }
  return { directory, migrations, run:yielding(run), apply:yielding(apply), execute:yielding(execute), capture:yielding(capture), close };
}

describe.sequential('real pinned Wrangler invariant capture', {timeout:180000}, () => {
  it('executes exact commented, multiline, quoted and equals SQL through the real CLI', async () => {
    const db = await localDatabase();
    try {
      for (const sql of ['SELECT \'it\'\'s a=b\' AS "quoted=value";', '-- leading a=b comment\nSELECT \'it\'\'s a=b\' AS "quoted=value";\n']) {
        expect(JSON.parse(await db.execute(sql))[0].results).toEqual([{ 'quoted=value': "it's a=b" }]);
      }
    } finally { db.close(); }
  });
  it('captures the complete migration chain and deterministic fixtures without losing SQL NULL', async () => {
    const db = await localDatabase();
    try {
      await db.run(['d1','execute','invariant-local-proof','--local','--file',path.join(repoRoot,'scripts/data/sql/deterministic-fixtures.sql')]);
      const before = await db.capture();
      expect(before.invariants.foreign_key_violations).toBe(0);
      expect(compare(before, await db.capture()).verdict).toBe('pass');
    } finally { db.close(); }
  });

  it('distinguishes SQL NULL from literal text null in nullable content, deletion state and template links', async () => {
    const db = await localDatabase();
    try {
      await db.execute(`INSERT INTO users(id,email,created_at) VALUES ('local-owner','local@example.invalid','2026-01-01');
        INSERT INTO templates(id,user_id,title,items,created_at) VALUES ('null','local-owner','Local template','[]','2026-01-01');
        INSERT INTO checklist_runs(id,user_id,title,items,started_at,created_at) VALUES ('local-run','local-owner','Local run','[]','2026-01-01','2026-01-01');`);
      for (const [table, column] of [['templates','description'], ['templates','deleted_at'], ['checklist_runs','deleted_at'], ['checklist_runs','template_id']]) {
        await db.execute(`UPDATE ${table} SET ${column}=NULL`);
        const before = await db.capture();
        await db.execute(`UPDATE ${table} SET ${column}='null'`);
        const after = await db.capture();
        expect(after.invariants.foreign_key_violations).toBe(0);
        expect(after.domain.digest).not.toBe(before.domain.digest);
        expect(compare(before, after).verdict).toBe('fail');
        await db.execute(`UPDATE ${table} SET ${column}=NULL`);
        expect(compare(before, await db.capture()).verdict).toBe('pass');
      }
      await db.execute('UPDATE checklist_runs SET progress=1.0000000000000002');
      const before = await db.capture();
      await db.execute('UPDATE checklist_runs SET progress=1.0000000000000004');
      expect(compare(before, await db.capture()).verdict).toBe('fail');
    } finally { db.close(); }
  });

  it('preserves exact BLOB JSON bytes and storage for active, deleted and retired content', async () => {
    const db = await localDatabase();
    try {
      await db.execute(`INSERT INTO users(id,email,created_at) VALUES ('local-owner','local@example.invalid','2026-01-01');
        INSERT INTO templates(id,user_id,title,items,created_at) VALUES ('local-template','local-owner','Local template','[]','2026-01-01');
        INSERT INTO checklist_runs(id,user_id,title,items,started_at,created_at) VALUES ('local-run','local-owner','Local run','[]','2026-01-01','2026-01-01');`);
      for (const [table, column] of [['templates','items'], ['checklist_runs','items'], ['checklist_runs','retired_items']]) {
        for (const deleted of [false, true]) {
          const raw = '[{"note":"private-one"}]';
          const blob = value => `x'${Buffer.from(value).toString('hex')}'`;
          await db.execute(`UPDATE ${table} SET deleted_at=${deleted ? "'2026-01-02'" : "NULL"}, ${column}=${blob(raw)}`);
          const before = await db.capture();
          expect(compare(before, await db.capture()).verdict).toBe('pass');
          for (const value of [blob(raw.replace('one','two')), blob(raw + ' '), `'${raw}'`]) {
            await db.execute(`UPDATE ${table} SET ${column}=${value}`);
            const after = await db.capture();
            expect(after.invariants).toEqual(before.invariants);
            expect(compare(before, after).verdict).toBe('fail');
            expect(JSON.stringify({before, after})).not.toMatch(/private-|local-owner|70726976617465/);
          }
        }
      }
    } finally { db.close(); }
  }, 600000);

  it('preserves a standalone SQL-NULL-linked run through actual pre0024 to 0024 migration', async () => {
    const db = await localDatabase(true);
    try {
      await db.execute(`INSERT INTO users(id,email,created_at) VALUES ('local-owner','local@example.invalid','2026-01-01');
        INSERT INTO checklist_runs(id,user_id,template_id,title,items,started_at,created_at) VALUES ('local-standalone','local-owner',NULL,'Local standalone','[]','2026-01-01','2026-01-01');`);
      const before = await db.capture();
      expect(before.hasEvolution).toBe(false);
      expect(before.domain.runs[0].hasTemplate).toBe(false);
      copyFileSync(path.join(migrationDirectory, evolution), path.join(db.migrations, evolution));
      await db.apply();
      const after = await db.capture();
      expect(after.hasEvolution).toBe(true);
      expect(after.domain.runs[0].templateVersion).toBe(1);
      expect(compare(before, after).verdict).toBe('pass');
      expect(compare(after, await db.capture()).verdict).toBe('pass');
    } finally { db.close(); }
  });
});
