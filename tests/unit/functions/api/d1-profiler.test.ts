import { describe, expect, it } from "vitest";
import { withD1Profiling, type D1QueryRecord } from "../../../../functions/api/utils/d1-profiler";

type Row = Record<string, unknown>;
type Calls = { all: number; raw: number; run: number; batch: number };

const resultOf = (results: Row[], rowsRead: number, rowsWritten: number): D1Result<Row> => ({
  success: true,
  results,
  meta: { rows_read: rowsRead, rows_written: rowsWritten, changes: rowsWritten, duration: 0, size_after: 0, last_row_id: 0, changed_db: rowsWritten > 0 },
});

class CountingStatement implements D1PreparedStatement {
  constructor(
    readonly sql: string,
    private readonly calls: Calls,
  ) {}

  bind(): CountingStatement {
    return this;
  }

  all<T = Row>(): Promise<D1Result<T>>;
  async all(): Promise<D1Result<Row>> {
    this.calls.all += 1;
    return resultOf([{ id: "a", title: "A" }], 7, this.sql.startsWith("insert") ? 3 : 0);
  }

  run<T = Row>(): Promise<D1Result<T>>;
  async run(): Promise<D1Result<Row>> {
    this.calls.run += 1;
    return resultOf([], 1, 2);
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw(): Promise<unknown[][]> {
    this.calls.raw += 1;
    return [["a", "A"]];
  }

  first<T = unknown>(column: string): Promise<T | null>;
  first<T = Row>(): Promise<T | null>;
  async first(): Promise<null> {
    throw new Error("The profiler tests read no first()");
  }
}

class CountingDatabase implements D1Database {
  readonly calls: Calls = { all: 0, raw: 0, run: 0, batch: 0 };

  prepare(sql: string): CountingStatement {
    return new CountingStatement(sql, this.calls);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  async batch(statements: D1PreparedStatement[]): Promise<D1Result<Row>[]> {
    this.calls.batch += 1;
    return Promise.all(statements.map((statement) => statement.all()));
  }

  exec(): Promise<D1ExecResult> {
    throw new Error("The profiler tests run no exec()");
  }

  withSession(): D1DatabaseSession {
    throw new Error("The profiler tests open no session");
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error("The profiler tests take no dump");
  }
}

function fakeDatabase() {
  const db = new CountingDatabase();
  return { db, calls: db.calls };
}

describe("withD1Profiling", () => {
  it("measures a read-only raw() with a separate all() and returns raw()'s own rows, which keep the duplicate column names all() merges", async () => {
    const { db, calls } = fakeDatabase();
    const records: D1QueryRecord[] = [];
    const rows = await withD1Profiling(db, (r) => records.push(r)).prepare("select id, title from templates").bind().raw();
    expect(rows).toEqual([["a", "A"]]);
    expect(calls).toMatchObject({ all: 1, raw: 1 });
    expect(records).toEqual([expect.objectContaining({ rowsRead: 7, rowsWritten: 0, rowsReturned: 1 })]);
  });

  it("never executes a write twice", async () => {
    const { db, calls } = fakeDatabase();
    const records: D1QueryRecord[] = [];
    const rows = await withD1Profiling(db, (r) => records.push(r)).prepare("insert into session values (?) returning id, title").bind("x").raw();
    expect(calls).toMatchObject({ all: 1, raw: 0 });
    expect(rows).toEqual([["a", "A"]]);
    expect(records[0]).toMatchObject({ rowsWritten: 3 });
  });

  it("records run() and each statement of a batch", async () => {
    const { db } = fakeDatabase();
    const records: D1QueryRecord[] = [];
    const profiled = withD1Profiling(db, (r) => records.push(r));
    await profiled.prepare("update runs set progress = 1").run();
    await profiled.batch([profiled.prepare("select 1"), profiled.prepare("select 2")]);
    expect(records.map((r) => r.sql)).toEqual(["update runs set progress = 1", "select 1", "select 2"]);
  });
});
