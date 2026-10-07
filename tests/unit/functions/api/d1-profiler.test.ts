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

  protected async rawRows() {
    this.calls.raw += 1;
    return [["a", "A"]];
  }
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
});
