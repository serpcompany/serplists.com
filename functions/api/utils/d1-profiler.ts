// Opt-in D1 query profiler (set D1_PROFILE=true; never enable in production).
// D1 bills by rows read (scanned) and rows written, reported in each result's `meta`.
// Drizzle runs most selects through `.raw()`, which returns no meta, so profiled
// `.raw()` and `.first()` calls are measured with an extra `.all()` of the same
// statement. That doubles their cost, which is fine for local profiling only.

export type D1QueryRecord = {
  sql: string;
  rowsRead: number;
  rowsWritten: number;
  rowsReturned: number;
  durationMs: number;
};

type Recorder = (record: D1QueryRecord) => void;

const isReadOnly = (sql: string) => /^\s*(select|with)\b/i.test(sql) && !/\b(insert|update|delete|replace)\b/i.test(sql);

const statementSql = new WeakMap<object, string>();
const statementTarget = new WeakMap<object, D1PreparedStatement>();

function toRecord(sql: string, result: D1Result<unknown>, startedAt: number): D1QueryRecord {
  return {
    sql,
    rowsRead: result.meta?.rows_read ?? 0,
    rowsWritten: result.meta?.rows_written ?? 0,
    rowsReturned: result.results?.length ?? 0,
    durationMs: Date.now() - startedAt,
  };
}

function profileStatement(statement: D1PreparedStatement, sql: string, record: Recorder): D1PreparedStatement {
  const profiled = new Proxy(statement, {
    get(target, prop, receiver) {
      if (prop === "bind") {
        return (...values: unknown[]) => profileStatement(target.bind(...values), sql, record);
      }
      if (prop === "all" || prop === "run") {
        return async () => {
          const startedAt = Date.now();
          const result = prop === "all" ? await target.all() : await target.run();
          record(toRecord(sql, result, startedAt));
          return result;
        };
      }
      if (prop === "first") {
        return async (column?: string) => {
          const startedAt = Date.now();
          const result = await target.all<Record<string, unknown>>();
          record(toRecord(sql, result, startedAt));
          const row = result.results[0];
          if (!row) return null;
          return column ? (row[column] ?? null) : row;
        };
      }
      if (prop === "raw") {
        return async (options?: { columnNames?: boolean }) => {
          const startedAt = Date.now();
          if (isReadOnly(sql)) {
            // Measure with a separate read; `.raw()` keeps duplicate column names that `.all()` merges.
            record(toRecord(sql, await target.all(), startedAt));
            return options?.columnNames ? target.raw({ columnNames: true }) : target.raw();
          }
          // Never execute a write twice: run it once and convert the rows (e.g. INSERT ... RETURNING).
          const result = await target.all<Record<string, unknown>>();
          record(toRecord(sql, result, startedAt));
          const rows = result.results.map((row) => Object.values(row));
          const columns = result.results[0] ? Object.keys(result.results[0]) : [];
          return options?.columnNames ? [columns, ...rows] : rows;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  statementSql.set(profiled, sql);
  statementTarget.set(profiled, statement);
  return profiled;
}

export function withD1Profiling(db: D1Database, record: Recorder): D1Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => profileStatement(target.prepare(sql), sql, record);
      }
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const startedAt = Date.now();
          const results = await target.batch(statements.map((statement) => statementTarget.get(statement) ?? statement));
          results.forEach((result, index) => {
            record(toRecord(statementSql.get(statements[index]) ?? "(unknown batch statement)", result, startedAt));
          });
          return results;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
