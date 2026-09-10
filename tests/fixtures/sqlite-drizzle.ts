import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as schema from '../../db/schema/index';
import { listMigrationFiles } from '../../scripts/data/schema-contract';
import { createSQLiteProxy } from '../../scripts/data/sqlite-proxy';

type StatementState = { sql: string; params: unknown[] };

const baselineRoot = mkdtempSync(path.join(tmpdir(), 'serplists-sqlite-baseline-'));
const baselinePath = path.join(baselineRoot, 'migrated.sqlite');
const baseline = new DatabaseSync(baselinePath);
baseline.exec('PRAGMA foreign_keys = ON');
for (const migration of listMigrationFiles(path.resolve('db/migrations'))) baseline.exec(migration.sql);
baseline.close();
process.once('exit', () => rmSync(baselineRoot, { recursive: true, force: true }));

export function createD1SqliteAdapter(database: DatabaseSync): D1Database {
  const makeStatement = (state: StatementState): D1PreparedStatement => {
    const statement = {
      bind(...params: unknown[]) {
        return makeStatement({ sql: state.sql, params });
      },
      async first(column?: string) {
        const row = database.prepare(state.sql).get(...state.params) as Record<string, unknown> | undefined;
        return column ? row?.[column] ?? null : row ?? null;
      },
      async run() {
        const result = database.prepare(state.sql).run(...state.params);
        return { success: true, results: [], meta: { changes: Number(result.changes) } } as never;
      },
      async all() {
        const results = database.prepare(state.sql).all(...state.params) as Array<Record<string, unknown>>;
        return { success: true, results, meta: {} } as never;
      },
      async raw() {
        return (database.prepare(state.sql).all(...state.params) as Array<Record<string, unknown>>).map((row) => Object.values(row)) as never;
      },
    };
    return statement as never;
  };
  const prepare = (sqlText: string) => makeStatement({ sql: sqlText, params: [] });
  return {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      database.exec('begin');
      try {
        for (const statement of statements) results.push(await statement.run());
        database.exec('commit');
        return results;
      } catch (error) {
        database.exec('rollback');
        throw error;
      }
    },
  } as never;
}

export function createSqliteDrizzleFixture() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'serplists-sqlite-fixture-'));
  const fixturePath = path.join(fixtureRoot, 'fixture.sqlite');
  copyFileSync(baselinePath, fixturePath);
  const database = new DatabaseSync(fixturePath);
  const proxy = createSQLiteProxy(database);
  return {
    database,
    db: proxy,
    binding: createD1SqliteAdapter(database),
    close: () => { database.close(); rmSync(fixtureRoot, { recursive: true, force: true }); },
  };
}
