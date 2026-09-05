import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it.skipIf(process.platform === 'win32')('post-schema CLI validates actual local D1 SQL through a controlled identity shim', () => {
  const root = path.resolve('.');
  const directory = mkdtempSync(path.join(tmpdir(), 'post-schema-real-d1-'));
  const config = path.join(directory, 'wrangler.toml');
  const databaseId = '11111111-1111-4111-8111-111111111111';
  const name = 'post-schema-local-proof';
  const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
  const target = ['--local', '--config', config, '--persist-to', path.join(directory, 'state')];
  const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
  writeFileSync(config, `name="post-schema-proof"\ncompatibility_date="2026-09-05"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="${name}"\ndatabase_id="${databaseId}"\nmigrations_dir=${JSON.stringify(path.join(root, 'db/migrations'))}\n`);
  const execute = (sql: string) => execFileSync(process.execPath, [cli, 'd1', 'execute', name, '--json', '--command', sql, ...target], { cwd: directory, env: safeEnv, encoding: 'utf8' });
  const shim = path.join(directory, 'pnpm');
  // Identity is synthetic and explicit. Every catalog/ledger SQL response is
  // produced unchanged by real Wrangler against the isolated migrated D1.
  writeFileSync(shim, `#!${process.execPath}
const {execFileSync}=require('node:child_process');const args=process.argv.slice(2);
if(args[0]!=='exec'||args[1]!=='wrangler'||args[2]!=='d1')process.exit(97);
if(args[3]==='info'){console.log(JSON.stringify({name:${JSON.stringify(name)},uuid:${JSON.stringify(databaseId)}}));process.exit(0);}
if(args[3]!=='execute'||!args.includes('--command')||!/^SELECT |^PRAGMA /.test(args[args.indexOf('--command')+1]))process.exit(98);
process.stdout.write(execFileSync(process.execPath,[${JSON.stringify(cli)},...args.slice(2).filter(arg=>arg!=='--remote'&&arg!=='--preview'),...${JSON.stringify(target)}],{cwd:${JSON.stringify(directory)},env:${JSON.stringify(safeEnv)},encoding:'utf8',stdio:['ignore','pipe','pipe']}));
`);
  chmodSync(shim, 0o700);
  const reportDir = path.join(directory, 'reports');
  const check = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/data/check-d1-schema.ts', '--database', name, '--database-id', databaseId, '--label', 'staging', '--report-dir', reportDir], { cwd: root, env: { ...safeEnv, PATH: `${directory}:${process.env.PATH}` }, encoding: 'utf8' });
  try {
    execFileSync(process.execPath, [cli, 'd1', 'migrations', 'apply', name, ...target], { cwd: directory, env: safeEnv, stdio: 'pipe' });
    expect(JSON.parse(execute("SELECT name FROM sqlite_schema WHERE name='_cf_METADATA'"))[0].results).toHaveLength(1);
    const healthy = check();
    expect(healthy.status, healthy.stdout + healthy.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(reportDir, 'd1-schema-staging.json'), 'utf8')).verdict).toBe('pass');
    for (const table of ['unreviewed_app_table']) {
      execute(`CREATE TABLE ${table}(id TEXT)`);
      const drift = check();
      expect(drift.status, drift.stdout + drift.stderr).toBe(1);
      expect(JSON.parse(readFileSync(path.join(reportDir, 'd1-schema-staging.json'), 'utf8')).verdict).toBe('fail');
      execute(`DROP TABLE ${table}`);
    }
    // D1 itself reserves _cf_ names. Verify rejection rather than mocking a
    // catalog response that this real local engine cannot produce.
    const reserved = spawnSync(process.execPath, [cli, 'd1', 'execute', name, '--json', '--command', 'CREATE TABLE _cf_unreviewed(id TEXT)', ...target], { cwd: directory, env: safeEnv, encoding: 'utf8' });
    expect(reserved.status).not.toBe(0);
    expect(reserved.stdout + reserved.stderr).toMatch(/not authorized|reserved|SQLITE_AUTH/i);
    expect(JSON.parse(execute("SELECT name FROM sqlite_schema WHERE name='_cf_unreviewed'"))[0].results).toEqual([]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 60_000);
