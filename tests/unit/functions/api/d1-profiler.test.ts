import { describe, expect, it } from "vitest";
import { withD1Profiling, type D1QueryRecord } from "../../../../functions/api/utils/d1-profiler";
import { D1DatabaseDouble, D1StatementDouble, d1Result } from "../../../support/d1Doubles";

type Calls = { all: number; raw: number; run: number; batch: number };

class CountingStatement extends D1StatementDouble {
  constructor(
    sql: string,
    private readonly calls: Calls,
  ) {
    super(sql);
  }

  protected async allRows() {
    this.calls.all += 1;
    return d1Result([{ id: "a", title: "A" }], { rows_read: 7, rows_written: this.sql.startsWith("insert") ? 3 : 0 });
  }

  protected override async runRows() {
    this.calls.run += 1;
    return d1Result([], { rows_read: 1, rows_written: 2 });
  }

  protected async rawRows(columnNames: boolean) {
    this.calls.raw += 1;
    return columnNames ? [["id", "title"], ["a", "A"]] : [["a", "A"]];
  }
}

class StatementOfRows extends D1StatementDouble {
  constructor(private readonly result: D1Result<Record<string, unknown>>) {
    super("select id, title from templates");
  }

  protected async allRows() {
    return this.result;
  }

  protected async rawRows() {
    return [];
  }
}

class DatabaseOfRows extends D1DatabaseDouble {
  constructor(private readonly result: D1Result<Record<string, unknown>>) {
    super();
  }

  prepare(): StatementOfRows {
    return new StatementOfRows(this.result);
  }
}

function profiledStatementAnswering(result: D1Result<Record<string, unknown>>) {
  const records: D1QueryRecord[] = [];
  const statement = withD1Profiling(new DatabaseOfRows(result), (r) => records.push(r)).prepare("select id, title from templates");
  return { statement, records };
}

class CountingDatabase extends D1DatabaseDouble {
  readonly calls: Calls = { all: 0, raw: 0, run: 0, batch: 0 };

  prepare(sql: string): CountingStatement {
    return new CountingStatement(sql, this.calls);
  }

  protected override batchRows(statements: D1PreparedStatement[]) {
    this.calls.batch += 1;
    return super.batchRows(statements);
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

  it("records a statement of a batch prepared on the database itself, which it never saw prepared, as an unknown batch statement", async () => {
    const { db } = fakeDatabase();
    const records: D1QueryRecord[] = [];
    const profiled = withD1Profiling(db, (r) => records.push(r));

    await profiled.batch([profiled.prepare("select 1"), db.prepare("select 2")]);

    expect(records.map((r) => r.sql)).toEqual(["select 1", "(unknown batch statement)"]);
  });

  it("hands raw() its column names on a read, measured by a separate all()", async () => {
    const { db, calls } = fakeDatabase();
    const rows = await withD1Profiling(db, () => undefined).prepare("select id, title from templates").raw({ columnNames: true });

    expect(rows).toEqual([["id", "title"], ["a", "A"]]);
    expect(calls).toMatchObject({ all: 1, raw: 1 });
  });

  it("answers raw() with column names on a write from its one all(), naming no columns when it returns no rows", async () => {
    const { db, calls } = fakeDatabase();
    const rows = await withD1Profiling(db, () => undefined).prepare("insert into session values (?) returning id, title").raw({ columnNames: true });
    const empty = await withD1Profiling(new DatabaseOfRows(d1Result([])), () => undefined).prepare("delete from session returning id").raw({ columnNames: true });

    expect(rows).toEqual([["id", "title"], ["a", "A"]]);
    expect(calls).toMatchObject({ all: 1, raw: 0 });
    expect(empty).toEqual([[]]);
  });

  it("answers first() from one measured all(): the first row, one of its columns, or null", async () => {
    const { statement, records } = profiledStatementAnswering(d1Result([{ id: "a", title: "A" }, { id: "b", title: "B" }], { rows_read: 2 }));

    expect(await statement.first()).toEqual({ id: "a", title: "A" });
    expect(await statement.first("title")).toBe("A");
    expect(await statement.first("missing")).toBeNull();
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ rowsRead: 2, rowsReturned: 2 });
    expect(await profiledStatementAnswering(d1Result([])).statement.first()).toBeNull();
  });

  it("is not mistaken for a promise when an async function returns a profiled statement", async () => {
    const { statement } = profiledStatementAnswering(d1Result([]));

    expect(await Promise.resolve(statement)).toBe(statement);
  });
});
