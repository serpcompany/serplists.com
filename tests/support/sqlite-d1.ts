// A D1Database backed by node:sqlite with every migration in db/migrations applied.
// Handler tests use it to run real SQL (guards, EXISTS subqueries, partial unique
// indexes, query plans) without wrangler. `beforeNextBatch` runs a competing write
// just before the handler's next db.batch(), which makes check-then-write races
// deterministic. Batches run in one transaction and roll back on error, like D1.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

type Row = Record<string, unknown>;
type BatchHook = () => void | Promise<void>;

export type RecordedQuery = { sql: string; params: unknown[] };

export type D1Result = {
  success: true;
  results: Row[];
  meta: { changes: number; rows_read: number; rows_written: number };
};

function toSqliteValue(value: unknown): SQLInputValue {
  if (typeof value === "undefined") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

class SqliteD1Statement {
  constructor(
    private readonly harness: SqliteD1,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new SqliteD1Statement(this.harness, this.sql, params);
  }

  async all() {
    return this.harness.execute(this, false);
  }

  async run() {
    return this.harness.execute(this, false);
  }

  async raw() {
    return this.harness.execute(this, true).results;
  }

  async first(column?: string) {
    const [row] = this.harness.execute(this, false).results;
    if (!row) return null;
    return column ? row[column] : row;
  }
}

export class SqliteD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly queries: RecordedQuery[] = [];
  private readonly batchHooks: BatchHook[] = [];

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
    for (const name of migrations) {
      this.sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
  }

  /** The object to pass as `env.DB`. */
  get binding(): D1Database {
    return this as unknown as D1Database;
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this, sql);
  }

  async batch(statements: SqliteD1Statement[]): Promise<D1Result[]> {
    const hook = this.batchHooks.shift();
    if (hook) await hook();

    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => this.execute(statement, false));
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  /** Runs `hook` right before the next db.batch() call, as if another request committed first. */
  beforeNextBatch(hook: BatchHook) {
    this.batchHooks.push(hook);
  }

  /** Runs a plain SQL write or read against the database, outside any handler. */
  run(sql: string, ...params: unknown[]) {
    this.sqlite.prepare(sql).run(...params.map(toSqliteValue));
  }

  rows<T extends Row = Row>(sql: string, ...params: unknown[]): T[] {
    return this.sqlite.prepare(sql).all(...params.map(toSqliteValue)).map((row) => ({ ...row }) as T);
  }

  /** EXPLAIN QUERY PLAN details for a recorded statement. */
  queryPlan(query: RecordedQuery): string[] {
    return this.rows<{ detail: string }>(`EXPLAIN QUERY PLAN ${query.sql}`, ...query.params)
      .map(({ detail }) => detail);
  }

  execute(statement: SqliteD1Statement, arrays: true): { results: unknown[][] };
  execute(statement: SqliteD1Statement, arrays: false): D1Result;
  execute(statement: SqliteD1Statement, arrays: boolean): D1Result | { results: unknown[][] } {
    this.queries.push({ sql: statement.sql, params: statement.params });
    const prepared = this.sqlite.prepare(statement.sql);
    prepared.setReturnArrays(arrays);
    const rows = prepared.all(...statement.params.map(toSqliteValue));
    if (arrays) return { results: rows as unknown as unknown[][] };

    const isRead = /^\s*select\b/i.test(statement.sql);
    const changes = isRead
      ? 0
      : Number((this.sqlite.prepare("select changes() as changes").get() as { changes: number }).changes);
    return {
      success: true,
      results: rows.map((row) => ({ ...row })),
      meta: { changes, rows_read: 0, rows_written: changes },
    };
  }
}
