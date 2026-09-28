import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// A minimal D1Database backed by an in-memory node:sqlite database. It covers the
// calls drizzle-orm/d1 makes (prepare/bind/all/raw/run/first/batch), so API code can
// run against real SQLite in unit tests without wrangler or a dev server.

type D1Row = Record<string, unknown>;

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

class SqliteD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.db, this.sql, params);
  }

  private values(): SQLInputValue[] {
    return this.params.map(toSqlValue);
  }

  async all<T = D1Row>() {
    const results = this.db.prepare(this.sql).all(...this.values()) as T[];
    return { results, success: true, meta: {} };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const statement = this.db.prepare(this.sql);
    statement.setReturnArrays(true);
    return statement.all(...this.values()) as T[];
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.values());
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }

  async first<T = D1Row>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values()) as D1Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

export type SqliteD1 = {
  binding: D1Database;
  sqlite: DatabaseSync;
  rows: <T = D1Row>(sql: string, ...params: unknown[]) => T[];
  close: () => void;
};

export function createSqliteD1(setupSql: string[] = []): SqliteD1 {
  const sqlite = new DatabaseSync(":memory:");
  for (const statement of setupSql) sqlite.exec(statement);

  const binding = {
    prepare: (sql: string) => new SqliteD1Statement(sqlite, sql),
    batch: async (statements: SqliteD1Statement[]) => Promise.all(statements.map((statement) => statement.all())),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;

  return {
    binding,
    sqlite,
    rows: <T = D1Row>(sql: string, ...params: unknown[]) =>
      sqlite.prepare(sql).all(...params.map(toSqlValue)) as T[],
    close: () => sqlite.close(),
  };
}

export function readMigration(name: string): string {
  return readFileSync(new URL(`../../../../../db/migrations/${name}`, import.meta.url), "utf8");
}

/** The users, Stripe billing, and entitlement override tables used by billing code. */
export function billingSchemaSql(): string[] {
  return [
    "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)",
    readMigration("0009_stripe_billing.sql"),
    readMigration("0010_entitlement_overrides.sql"),
  ];
}
