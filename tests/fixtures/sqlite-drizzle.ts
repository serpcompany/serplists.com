import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as schema from '../../db/schema/index';
import { listMigrationFiles } from '../../scripts/data/schema-contract';
import { createSQLiteProxy } from '../../scripts/data/sqlite-proxy';

const baselineRoot = mkdtempSync(path.join(tmpdir(), 'serplists-sqlite-baseline-'));
const baselinePath = path.join(baselineRoot, 'migrated.sqlite');
const baseline = new DatabaseSync(baselinePath);
baseline.exec('PRAGMA foreign_keys = ON');
for (const migration of listMigrationFiles(path.resolve('db/migrations'))) baseline.exec(migration.sql);
baseline.close();
process.once('exit', () => rmSync(baselineRoot, { recursive: true, force: true }));

export function createSqliteDrizzleFixture() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'serplists-sqlite-fixture-'));
  const fixturePath = path.join(fixtureRoot, 'fixture.sqlite');
  copyFileSync(baselinePath, fixturePath);
  const database = new DatabaseSync(fixturePath);
  const proxy = createSQLiteProxy(database);
  return {
    database,
    db: proxy,
    close: () => { database.close(); rmSync(fixtureRoot, { recursive: true, force: true }); },
  };
}
