import { and, getTableColumns, is, sql, SQL, type Column, type SQLWrapper } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { createDb } from '../db';

type Db = ReturnType<typeof createDb>;

function valueAsDrizzleInsertFillsIt(column: Column, value: unknown): unknown {
  if (value !== undefined) return sql.param(value, column);
  if (column.default === undefined) return sql`null`;
  return is(column.default, SQL) ? column.default : sql.param(column.default, column);
}

export function allConditions(...conditions: (SQLWrapper | undefined)[]): SQL {
  const combined = and(...conditions);
  if (!combined) throw new Error('allConditions: pass at least one condition');
  return combined;
}

export function insertRowWhere<TTable extends SQLiteTable>(
  db: Db,
  table: TTable,
  values: TTable['$inferInsert'],
  condition: SQL,
) {
  const provided = values as Record<string, unknown>;
  const selected = Object.entries(getTableColumns(table) as Record<string, Column>)
    .map(([key, column]) => sql`${valueAsDrizzleInsertFillsIt(column, provided[key])}`);
  return db.insert(table).select(sql`select ${sql.join(selected, sql`, `)} where ${condition}`);
}

export function rowExistsSql(idColumn: SQLiteColumn, id: string, extra?: SQL): SQL {
  return sql`exists (select 1 from ${idColumn.table} where ${idColumn} = ${id}${extra ? sql` and ${extra}` : sql``})`;
}
