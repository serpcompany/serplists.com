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

type RawOptions = { columnNames?: boolean };

async function rawReadMeasuredBySeparateAll(
  target: D1PreparedStatement,
  sql: string,
  record: Recorder,
  options?: RawOptions,
) {
  const startedAt = Date.now();
  record(toRecord(sql, await target.all(), startedAt));
  return options?.columnNames ? target.raw({ columnNames: true }) : target.raw();
}

async function rawRowsOfSingleWrite(target: D1PreparedStatement, sql: string, record: Recorder, options?: RawOptions) {
  const startedAt = Date.now();
  const result = await target.all<Record<string, unknown>>();
  record(toRecord(sql, result, startedAt));
  const rows = result.results.map((row) => Object.values(row));
  const columns = result.results[0] ? Object.keys(result.results[0]) : [];
  return options?.columnNames ? [columns, ...rows] : rows;
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
        return (options?: RawOptions) =>
          isReadOnly(sql)
            ? rawReadMeasuredBySeparateAll(target, sql, record, options)
            : rawRowsOfSingleWrite(target, sql, record, options);
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
            const statement = statements[index];
            const sql = statement === undefined ? undefined : statementSql.get(statement);
            record(toRecord(sql ?? "(unknown batch statement)", result, startedAt));
          });
          return results;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
