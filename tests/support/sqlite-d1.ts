import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { allRowsAsArrays } from "./sqliteRowArrays";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

type Row = Record<string, unknown>;
type CompetingWrite = () => void | Promise<void>;

export type RecordedQuery = { sql: string; params: unknown[] };

export type StatementHook = (sql: string, params: unknown[]) => void;

export type SqliteD1Result = {
  success: true;
  results: Row[];
  meta: { changes: number; rows_read: number; rows_written: number };
};

export type SqliteD1Options = {
  schemaSql?: string[];
};

export function readMigration(name: string): string {
  return readFileSync(path.join(migrationsDir, name), "utf8");
}

export function everyMigrationSql(): string[] {
  return readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort().map(readMigration);
}

function toSqliteValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") return value;
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`D1 cannot bind a value of type ${typeof value}`);
}

class SqliteD1Statement {
  constructor(
    private readonly database: SqliteD1,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new SqliteD1Statement(this.database, this.sql, params);
  }

  async all() {
    return this.database.execute(this, false);
  }

  async run() {
    return this.database.execute(this, false);
  }

  async raw() {
    return this.database.execute(this, true).results;
  }

  async first(column?: string) {
    const [row] = this.database.execute(this, false).results;
    if (!row) return null;
    return column ? row[column] : row;
  }
}

export class SqliteD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly queries: RecordedQuery[] = [];
  private readonly competingWritesBeforeNextBatch: CompetingWrite[] = [];
  private beforeStatement: StatementHook | null = null;

  constructor({ schemaSql = everyMigrationSql() }: SqliteD1Options = {}) {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const sql of schemaSql) this.sqlite.exec(sql);
  }

  get binding(): D1Database {
    return this as unknown as D1Database;
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this, sql);
  }

  async batch(statements: SqliteD1Statement[]): Promise<SqliteD1Result[]> {
    const competingWrite = this.competingWritesBeforeNextBatch.shift();
    if (competingWrite) await competingWrite();

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

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }

  beforeNextBatch(competingWrite: CompetingWrite) {
    this.competingWritesBeforeNextBatch.push(competingWrite);
  }

  setStatementHook(hook: StatementHook | null) {
    this.beforeStatement = hook;
  }

  run(sql: string, ...params: unknown[]) {
    this.sqlite.prepare(sql).run(...params.map(toSqliteValue));
  }

  rows<T extends Row = Row>(sql: string, ...params: unknown[]): T[] {
    return this.sqlite.prepare(sql).all(...params.map(toSqliteValue)).map((row) => ({ ...row }) as T);
  }

  queryPlan(query: RecordedQuery): string[] {
    return this.rows<{ detail: string }>(`EXPLAIN QUERY PLAN ${query.sql}`, ...query.params)
      .map(({ detail }) => detail);
  }

  close() {
    this.sqlite.close();
  }

  execute(statement: SqliteD1Statement, arrays: true): { results: unknown[][] };
  execute(statement: SqliteD1Statement, arrays: false): SqliteD1Result;
  execute(statement: SqliteD1Statement, arrays: boolean): SqliteD1Result | { results: unknown[][] } {
    this.beforeStatement?.(statement.sql, statement.params);
    this.queries.push({ sql: statement.sql, params: statement.params });
    const prepared = this.sqlite.prepare(statement.sql);
    const values = statement.params.map(toSqliteValue);
    if (arrays) return { results: allRowsAsArrays(prepared, values) };
    const rows = prepared.all(...values);

    const isRead = /^\s*select\b/i.test(statement.sql);
    const changes = isRead ? 0 : Number(this.sqlite.prepare("select changes() as changes").get()?.["changes"]);
    return {
      success: true,
      results: rows.map((row) => ({ ...row })),
      meta: { changes, rows_read: 0, rows_written: changes },
    };
  }
}
