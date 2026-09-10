import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { listMigrationFiles } from './schema-contract';
import { inspectSourceSchema } from './source-schema';
import { applyOrderedWranglerMigrations } from './ordered-wrangler-replay.mjs';

it('accepts real local D1 pre/current source catalogs and rejects an extra app object', async () => {
  const repoRoot = path.resolve('.');
  const directory = mkdtempSync(path.join(tmpdir(), 'source-catalog-real-d1-'));
  const migrations = path.join(directory, 'migrations'); mkdirSync(migrations);
  const config = path.join(directory, 'wrangler.toml');
  const database = { databaseName: 'source-catalog-real', databaseId: '11111111-1111-4111-8111-111111111111' };
  writeFileSync(config, `name="source-catalog-proof"\ncompatibility_date="2026-09-05"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="${database.databaseName}"\ndatabase_id="${database.databaseId}"\nmigrations_dir=${JSON.stringify(migrations)}\n`);
  const run = (args: string[]) => execFileSync(process.execPath, [path.join(repoRoot, 'node_modules/wrangler/bin/wrangler.js'), 'd1', ...args, '--local', '--config', config, '--persist-to', path.join(directory, 'state')], { cwd: directory, env: { PATH: process.env.PATH, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const files = listMigrationFiles();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const execute = (sql: string) => run(['execute', database.databaseName, '--json', '--command', sql]);
  try {
    await applyOrderedWranglerMigrations({
      sourceDirectory: path.join(repoRoot, 'db/migrations'),
      ownedDirectory: migrations,
      throughMigration: files.at(-2)!.name,
      apply: () => run(['migrations', 'apply', database.databaseName]),
    });
    expect(JSON.parse(execute("SELECT type,name FROM sqlite_schema WHERE name GLOB '_cf_*'"))[0].results).toContainEqual({ type: 'table', name: '_cf_METADATA' });
    expect(inspectSourceSchema({ commit, database, pendingMigrations: [files.at(-1)!.name], execute }).appliedThrough).toBe(files.at(-2)!.name);
    copyFileSync(path.join(repoRoot, 'db/migrations', files.at(-1)!.name), path.join(migrations, files.at(-1)!.name));
    run(['migrations', 'apply', database.databaseName]);
    expect(inspectSourceSchema({ commit, database, pendingMigrations: [], execute }).appliedThrough).toBe(files.at(-1)!.name);
    execute('CREATE TABLE unreviewed_app_object(id TEXT)');
    expect(() => inspectSourceSchema({ commit, database, pendingMigrations: [], execute })).toThrow('Production source catalog verification failed before migration writes.');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30_000);
