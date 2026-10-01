import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { allRowsAsArrays } from "../../../../support/sqliteRowArrays";

type D1Row = Record<string, unknown>;

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

  async raw(): Promise<unknown[][]> {
    const values = this.values();
    return allRowsAsArrays(this.db.prepare(this.sql), values);
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
