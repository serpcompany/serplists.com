import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '@functions/api/db';
import { withD1Profiling, type D1QueryRecord } from '@functions/api/utils/d1-profiler';
import { apiEnv } from '../../../support/apiEnv';
import { SqliteD1 } from '../../../support/sqlite-d1';
import { logLineIn } from '../../../support/storedJson';

const NOTES_TABLE = 'create table notes (id text primary key, body text not null)';

function notesDatabase() {
  return new SqliteD1({ schemaSql: [NOTES_TABLE] });
}

function loggedQueries(info: { mock: { calls: unknown[][] } }) {
  return info.mock.calls.map(([line]) => logLineIn(line)).filter((line) => line.message === 'd1_query');
}

describe('createDb with D1_PROFILE', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs every statement Drizzle runs, with the rows it wrote and returned, and still answers as D1 would', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const db = createDb(apiEnv({ DB: notesDatabase().binding, D1_PROFILE: 'true' }));

    await db.run(sql`insert into notes (id, body) values ('a', 'first')`);
    const inserted = await db.values(sql`insert into notes (id, body) values ('b', 'second') returning id, body`);
    const rows = await db.all(sql`select id, body from notes order by id`);
    const values = await db.values(sql`select id from notes order by id`);
    await db.batch([db.run(sql`update notes set body = 'changed' where id = 'a'`), db.run(sql`delete from notes where id = 'b'`)]);

    expect(inserted).toEqual([['b', 'second']]);
    expect(rows).toEqual([{ id: 'a', body: 'first' }, { id: 'b', body: 'second' }]);
    expect(values).toEqual([['a'], ['b']]);
    expect(loggedQueries(info).map(({ sql: text, rowsWritten, rowsReturned }) => ({ text, rowsWritten, rowsReturned }))).toEqual([
      { text: "insert into notes (id, body) values ('a', 'first')", rowsWritten: 1, rowsReturned: 0 },
      { text: "insert into notes (id, body) values ('b', 'second') returning id, body", rowsWritten: 1, rowsReturned: 1 },
      { text: 'select id, body from notes order by id', rowsWritten: 0, rowsReturned: 2 },
      { text: 'select id from notes order by id', rowsWritten: 0, rowsReturned: 2 },
      { text: "update notes set body = 'changed' where id = 'a'", rowsWritten: 1, rowsReturned: 0 },
      { text: "delete from notes where id = 'b'", rowsWritten: 1, rowsReturned: 0 },
    ]);
  });

  it('logs nothing and hands Drizzle the binding itself when profiling is off', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const database = notesDatabase();
    const db = createDb(apiEnv({ DB: database.binding }));

    await db.run(sql`insert into notes (id, body) values ('a', 'first')`);

    expect(db.$client).toBe(database);
    expect(loggedQueries(info)).toEqual([]);
  });
});

describe('withD1Profiling as a D1 binding', () => {
  it('runs a batch statement prepared on the binding underneath, recording it as unknown', async () => {
    const database = notesDatabase();
    const records: D1QueryRecord[] = [];
    const profiled = withD1Profiling(database.binding, (record) => records.push(record));

    await profiled.batch([
      profiled.prepare("insert into notes (id, body) values ('a', 'first')"),
      database.prepare("insert into notes (id, body) values ('b', 'second')"),
    ]);

    expect(database.sqlite.prepare('select id from notes order by id').all()).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(records.map((record) => record.sql)).toEqual([
      "insert into notes (id, body) values ('a', 'first')",
      '(unknown batch statement)',
    ]);
  });

  it('passes the binding’s other methods through, bound to it', async () => {
    const database = notesDatabase();
    const profiled = withD1Profiling(database.binding, () => undefined);

    await profiled.exec("insert into notes (id, body) values ('a', 'first')");

    expect(database.sqlite.prepare('select body from notes').all()).toEqual([{ body: 'first' }]);
  });

  it('still answers first() on a profiled statement, which nothing in the API calls and the profiler does not measure', async () => {
    const database = notesDatabase();
    database.sqlite.exec("insert into notes (id, body) values ('a', 'first')");
    const records: D1QueryRecord[] = [];
    const profiled = withD1Profiling(database.binding, (record) => records.push(record));

    await expect(profiled.prepare('select body from notes where id = ?').bind('a').first('body')).resolves.toBe('first');
    expect(records).toEqual([]);
  });

  it('is not mistaken for a promise when an async function returns it', async () => {
    const profiled = withD1Profiling(notesDatabase().binding, () => undefined);
    const resolved = await Promise.resolve(profiled);

    expect(resolved).toBe(profiled);
  });
});
