import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../../db/schema/index';

export function rowsAsValues(rows: Array<Record<string, unknown>>): unknown[][] {
  return rows.map((row) => Object.values(row));
}

export function createSQLiteProxy(database: DatabaseSync) {
  return drizzle(async (query, params, method) => {
    const statement = database.prepare(query);
    if (method === 'run') {
      statement.run(...params);
      return { rows: [] };
    }
    if (method === 'get') {
      const row = statement.get(...params) as Record<string, unknown> | undefined;
      return { rows: row ? Object.values(row) : [] };
    }
    return { rows: rowsAsValues(statement.all(...params) as Array<Record<string, unknown>>) };
  }, { schema });
}
