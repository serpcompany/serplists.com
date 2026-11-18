import { getTableColumns, is, sql, SQL, type Column, type SQLWrapper } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { createDb } from '../db';

type Db = ReturnType<typeof createDb>;

const DRIZZLE_TABLE_COLUMNS = Symbol.for('drizzle:Columns');

function valueAsDrizzleInsertFillsIt(column: Column, value: unknown): unknown {
  if (value !== undefined) return is(value, SQL) ? value : sql.param(value, column);
  if (column.default !== undefined && column.default !== null) {
    return is(column.default, SQL) ? column.default : sql.param(column.default, column);
  }
  const generated = column.defaultFn?.() ?? column.onUpdateFn?.();
  if (generated !== undefined) return is(generated, SQL) ? generated : sql.param(generated, column);
  return sql`null`;
}

export function withoutColumns<TTable extends SQLiteTable>(table: TTable, omit: readonly string[]): TTable {
  if (omit.length === 0) return table;
  const columns = Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([key]) => !omit.includes(key)),
  );
  return new Proxy(table, {
    get(target, property, receiver) {
      if (property === DRIZZLE_TABLE_COLUMNS) return columns;
      const value: unknown = Reflect.get(target, property, receiver);
      return value;
    },
  });
}

export function allConditions(first: SQLWrapper, ...rest: (SQLWrapper | undefined)[]): SQL {
  const conditions = [first, ...rest.filter((condition) => condition !== undefined)];
  return conditions.length === 1 ? sql`${first}` : sql`(${sql.join(conditions, sql` and `)})`;
}

const isWritableColumn = (column: Column): boolean => !column.generated || column.generated.type === 'byDefault';

export function insertRowWhere<TTable extends SQLiteTable>(
  db: Db,
  table: TTable,
  values: TTable['$inferInsert'],
  condition: SQL,
  options: { omitColumns?: readonly string[] } = {},
) {
  const target = withoutColumns(table, options.omitColumns ?? []);
  const provided = values as Record<string, unknown>;
  const selected = Object.entries(getTableColumns(target) as Record<string, Column>)
    .filter(([, column]) => isWritableColumn(column))
    .map(([key, column]) => sql`${valueAsDrizzleInsertFillsIt(column, provided[key])}`);
  return db.insert(target).select(sql`select ${sql.join(selected, sql`, `)} where ${condition}`);
}

export function rowExistsSql(idColumn: SQLiteColumn, id: string, extra?: SQL): SQL {
  return sql`exists (select 1 from ${idColumn.table} where ${idColumn} = ${id}${extra ? sql` and ${extra}` : sql``})`;
}
