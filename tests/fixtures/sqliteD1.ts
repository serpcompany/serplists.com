import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Env } from '../../functions/api/types';
import { allRowsAsArrays } from '../support/sqliteRowArrays';

const MIGRATIONS_DIR = new URL('../../db/migrations/', import.meta.url);

type Row = Record<string, unknown>;

export function createMigratedD1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
  }

  const statement = (query: string, params: SQLInputValue[] = []) => ({
    bind: (...next: unknown[]) => statement(query, next as SQLInputValue[]),
    all: async () => ({ results: sqlite.prepare(query).all(...params) as Row[], success: true, meta: {} }),
    raw: async () => allRowsAsArrays(sqlite.prepare(query), params),
    first: async () => (sqlite.prepare(query).get(...params) as Row | undefined) ?? null,
    run: async () => {
      const result = sqlite.prepare(query).run(...params);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    },
  });

  const d1 = {
    prepare: (query: string) => statement(query),
    batch: async (statements: Array<ReturnType<typeof statement>>) =>
      Promise.all(statements.map((bound) => bound.all())),
  };

  return { d1: d1 as unknown as Env['DB'], sqlite };
}
