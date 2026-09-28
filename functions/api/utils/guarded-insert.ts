import { getTableColumns, is, sql, SQL, type Column } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { createDb } from '../db';

// Conditional writes for plan limits. A count read in one D1 call and an insert in a later
// batch race: parallel requests all read the same count and all insert. Putting the check
// inside the statement makes it atomic, because D1 runs each statement (and each batch) as
// one transaction. After the batch, `meta.changes === 0` on the guarded statement means the
// condition was false and nothing was written.

type Db = ReturnType<typeof createDb>;

// Mirrors how Drizzle fills a column in a plain insert: the given value, else the column's
// default or default function, else NULL. Values are encoded through their column.
function columnValue(column: Column, value: unknown): unknown {
  if (value !== undefined) return is(value, SQL) ? value : sql.param(value, column);
  if (column.default !== undefined && column.default !== null) {
    return is(column.default, SQL) ? column.default : sql.param(column.default, column);
  }
  const generated = column.defaultFn?.() ?? column.onUpdateFn?.();
  if (generated !== undefined) return is(generated, SQL) ? generated : sql.param(generated, column);
  return sql`null`;
}

/**
 * `table` as Drizzle's insert builder sees it, minus the `omit` columns. Drizzle names every
 * column of the table in an INSERT (filling missing values with defaults or NULL), so leaving
 * a value out is not enough when the database lacks the column, for example before a
 * migration that adds it has been applied. Only the column list changes; the table name,
 * column encoding and everything else come from `table`.
 */
export function withoutColumns<TTable extends SQLiteTable>(table: TTable, omit: readonly string[]): TTable {
  if (omit.length === 0) return table;
  // The key Drizzle keeps a table's columns under (not in its public types). getTableColumns
  // reads the same key, so the check below fails loudly if a Drizzle upgrade moves it.
  const columnsKey = Symbol.for('drizzle:Columns');
  if ((table as unknown as Record<symbol, unknown>)[columnsKey] !== getTableColumns(table)) {
    throw new Error('withoutColumns: unsupported Drizzle table layout');
  }
  const columns = Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([key]) => !omit.includes(key)),
  );
  return Object.create(table, { [columnsKey]: { value: columns } }) as TTable;
}

/**
 * `INSERT INTO table (every column) SELECT values WHERE condition`: writes the same row as
 * `db.insert(table).values(values)`, but only when `condition` holds at write time.
 * `omitColumns` leaves those columns out of the statement entirely (see `withoutColumns`).
 */
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
    // Generated columns cannot be written, exactly as Drizzle's own insert skips them.
    .filter(([, column]) => !column.generated || column.generated.type === 'byDefault')
    .map(([key, column]) => sql`${columnValue(column, provided[key])}`);
  return db.insert(target).select(sql`select ${sql.join(selected, sql`, `)} where ${condition}`);
}

/** True once the row with this id exists (and matches `extra`): guards a companion insert. */
export function rowExistsSql(idColumn: SQLiteColumn, id: string, extra?: SQL): SQL {
  return sql`exists (select 1 from ${idColumn.table} where ${idColumn} = ${id}${extra ? sql` and ${extra}` : sql``})`;
}
