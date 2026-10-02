import { and, getTableColumns, is, sql, SQL, type Column, type SQLWrapper } from 'drizzle-orm';
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
  if (!(DRIZZLE_TABLE_COLUMNS in table) || table[DRIZZLE_TABLE_COLUMNS] !== getTableColumns(table)) {
    throw new Error('withoutColumns: unsupported Drizzle table layout');
  }
  const columns = Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([key]) => !omit.includes(key)),
  );
  const narrowed: unknown = Object.create(table, { [DRIZZLE_TABLE_COLUMNS]: { value: columns } });
  if (!inheritsFrom(narrowed, table)) throw new Error('withoutColumns: the narrowed table does not inherit from the table');
  return narrowed;
}

function inheritsFrom<Base extends object>(value: unknown, base: Base): value is Base {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === base;
}

export function allConditions(...conditions: (SQLWrapper | undefined)[]): SQL {
  const combined = and(...conditions);
  if (!combined) throw new Error('allConditions: pass at least one condition');
  return combined;
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
