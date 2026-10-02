import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { allRowsAsArrays } from "./sqliteRowArrays";
import { D1StatementDouble, type StoredRow } from "./d1Doubles";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

type Row = Record<string, unknown>;
type CompetingWrite = () => void | Promise<void>;

export type RecordedQuery = { sql: string; params: unknown[] };

export type StatementHook = (sql: string, params: unknown[]) => void;

export type SqliteD1Result = D1Result<Row>;

type RowArrays = { columns: string[]; results: unknown[][] };

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

class SqliteD1Statement extends D1StatementDouble {
  constructor(
    private readonly database: SqliteD1,
    sql: string,
    params: unknown[] = [],
  ) {
    super(sql, params);
  }

  protected override boundTo(params: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, params);
  }

  protected async allRows(): Promise<SqliteD1Result> {
    return this.database.execute(this, false);
  }

  protected async rawRows(columnNames: boolean): Promise<unknown[][]> {
    const { columns, results } = this.database.execute(this, true);
    return columnNames ? [columns, ...results] : results;
  }
}

function sqliteD1Statement(statement: D1PreparedStatement): SqliteD1Statement {
  if (statement instanceof SqliteD1Statement) return statement;
  throw new TypeError("A SqliteD1 batch runs only statements its own prepare() made");
}

class SqliteD1Session implements D1DatabaseSession {
  constructor(private readonly database: SqliteD1) {}

  prepare(sql: string): SqliteD1Statement {
    return this.database.prepare(sql);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  async batch(statements: D1PreparedStatement[]): Promise<SqliteD1Result[]> {
    return this.database.batch(statements);
  }

  getBookmark(): null {
    return null;
  }
}

export class SqliteD1 implements D1Database {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly queries: RecordedQuery[] = [];
  private readonly competingWritesBeforeNextBatch: CompetingWrite[] = [];
  private beforeStatement: StatementHook | null = null;

  constructor({ schemaSql = everyMigrationSql() }: SqliteD1Options = {}) {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const sql of schemaSql) this.sqlite.exec(sql);
  }

  get binding(): D1Database {
    return this;
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this, sql);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  async batch(statements: D1PreparedStatement[]): Promise<SqliteD1Result[]> {
    const competingWrite = this.competingWritesBeforeNextBatch.shift();
    if (competingWrite) await competingWrite();

    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => this.execute(sqliteD1Statement(statement), false));
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }

  withSession(): SqliteD1Session {
    return new SqliteD1Session(this);
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error("D1 removed dump() with its alpha databases, so the SqliteD1 stand-in has none");
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

  rows<T extends Row = StoredRow>(sql: string, ...params: unknown[]): T[];
  rows(sql: string, ...params: unknown[]): Row[] {
    return this.sqlite.prepare(sql).all(...params.map(toSqliteValue)).map((row) => ({ ...row }));
  }

  queryPlan(query: RecordedQuery): string[] {
    return this.rows<{ detail: string }>(`EXPLAIN QUERY PLAN ${query.sql}`, ...query.params)
      .map(({ detail }) => detail);
  }

  close() {
    this.sqlite.close();
  }

  execute(statement: SqliteD1Statement, arrays: true): RowArrays;
  execute(statement: SqliteD1Statement, arrays: false): SqliteD1Result;
  execute(statement: SqliteD1Statement, arrays: boolean): SqliteD1Result | RowArrays {
    this.beforeStatement?.(statement.sql, statement.params);
    this.queries.push({ sql: statement.sql, params: statement.params });
    const prepared = this.sqlite.prepare(statement.sql);
    const values = statement.params.map(toSqliteValue);
    if (arrays) return { columns: prepared.columns().map(({ name }) => name), results: allRowsAsArrays(prepared, values) };
    const rows = prepared.all(...values);

    const isRead = /^\s*select\b/i.test(statement.sql);
    const writeMeta = isRead ? undefined : this.sqlite.prepare("select changes() as changes, last_insert_rowid() as id").get();
    const changes = Number(writeMeta?.["changes"] ?? 0);
    return {
      success: true,
      results: rows.map((row) => ({ ...row })),
      meta: {
        changes,
        rows_read: 0,
        rows_written: changes,
        duration: 0,
        size_after: 0,
        last_row_id: Number(writeMeta?.["id"] ?? 0),
        changed_db: changes > 0,
      },
    };
  }
}
