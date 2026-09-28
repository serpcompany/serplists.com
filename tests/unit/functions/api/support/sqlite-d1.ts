import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// A minimal D1Database backed by an in-memory node:sqlite database. It covers the
// calls drizzle-orm/d1 makes (prepare/bind/all/raw/run/first/batch), so API code can
// run against real SQLite in unit tests without wrangler or a dev server. Like D1, a
// batch is one transaction: if any statement fails, none of the batch is written.

type D1Row = Record<string, unknown>;

/**
 * Runs before every statement with its SQL and bound parameters. Throw from it to
 * simulate a D1 failure (for example "D1_ERROR: Network connection lost"); the
 * statement then does not run.
 */
export type StatementHook = (sql: string, params: unknown[]) => void;

type Hooks = { beforeStatement: StatementHook | null };

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

class SqliteD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly hooks: Hooks,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.db, this.hooks, this.sql, params);
  }

  private values(): SQLInputValue[] {
    this.hooks.beforeStatement?.(this.sql, this.params);
    return this.params.map(toSqlValue);
  }

  async all<T = D1Row>() {
    const values = this.values();
    const results = this.db.prepare(this.sql).all(...values) as T[];
    return { results, success: true, meta: {} };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const values = this.values();
    const statement = this.db.prepare(this.sql);
    statement.setReturnArrays(true);
    return statement.all(...values) as T[];
  }

  async run() {
    const values = this.values();
    const info = this.db.prepare(this.sql).run(...values);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }

  async first<T = D1Row>(column?: string): Promise<T | null> {
    const values = this.values();
    const row = this.db.prepare(this.sql).get(...values) as D1Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

export type SqliteD1 = {
  binding: D1Database;
  sqlite: DatabaseSync;
  rows: <T = D1Row>(sql: string, ...params: unknown[]) => T[];
  /** Sets (or clears, with null) the hook that runs before each statement. */
  setStatementHook: (hook: StatementHook | null) => void;
  close: () => void;
};

export function createSqliteD1(setupSql: string[] = []): SqliteD1 {
  const sqlite = new DatabaseSync(":memory:");
  for (const statement of setupSql) sqlite.exec(statement);
  const hooks: Hooks = { beforeStatement: null };

  const binding = {
    prepare: (sql: string) => new SqliteD1Statement(sqlite, hooks, sql),
    batch: async (statements: SqliteD1Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
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
    setStatementHook: (hook) => {
      hooks.beforeStatement = hook;
    },
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
    `CREATE TABLE team_entitlement_overrides (
      team_id TEXT PRIMARY KEY, plan TEXT NOT NULL, expires_at INTEGER, note TEXT,
      created_at TEXT NOT NULL, updated_at TEXT
    )`,
  ];
}
