import { describe, expect, it, vi } from "vitest";
import { withD1Profiling, type D1QueryRecord } from "../../../../functions/api/utils/d1-profiler";

function fakeDatabase() {
  const calls = { all: 0, raw: 0, run: 0, batch: 0 };
  const statement = (sql: string) => {
    const self = {
      sql,
      bind: vi.fn(() => self),
      all: vi.fn(async () => {
        calls.all += 1;
        return { results: [{ id: "a", title: "A" }], success: true, meta: { rows_read: 7, rows_written: sql.startsWith("insert") ? 3 : 0 } };
      }),
      raw: vi.fn(async () => {
        calls.raw += 1;
        return [["a", "A"]];
      }),
      run: vi.fn(async () => {
        calls.run += 1;
        return { results: [], success: true, meta: { rows_read: 1, rows_written: 2 } };
      }),
    };
    return self;
  };
  const db = {
    prepare: vi.fn((sql: string) => statement(sql)),
    batch: vi.fn(async (statements: { all: () => Promise<unknown> }[]) => {
      calls.batch += 1;
      return Promise.all(statements.map((s) => s.all()));
    }),
  };
  return { db: db as unknown as D1Database, calls };
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
