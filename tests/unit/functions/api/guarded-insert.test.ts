import { describe, expect, it } from 'vitest';
import { d1ThatRunsNoQuery } from '../../../support/apiEnv';
import { drizzle } from 'drizzle-orm/d1';
import { sql, type SQL } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { schema } from '@functions/api/db';
import { allConditions, insertRowWhere, rowExistsSql, withoutColumns } from '@functions/api/utils/guarded-insert';
import { activeRunCapacityAvailableSql } from '@functions/api/utils/active-run-limit';

const drizzleWithoutD1 = drizzle(d1ThatRunsNoQuery(), { schema });

type BuiltInsert = { sql: string; params: unknown[] };

function expectThePlainInsertsValues(guarded: BuiltInsert, plain: BuiltInsert) {
  expect(guarded.sql.slice(guarded.sql.indexOf(' select ') + 8, guarded.sql.lastIndexOf(' where '))).toBe(
    plain.sql.slice(plain.sql.indexOf(' values (') + 9, -1),
  );
  expect(guarded.params).toEqual(plain.params);
}

describe('insertRowWhere', () => {
  it('writes the same columns and values as a plain insert, booleans and defaults included, behind the condition', () => {
    const run = {
      id: 'run-1',
      user_id: 'user-1',
      title: 'Run',
      items: '[]',
      started_at: 'now',
      created_at: 'now',
      is_public: true,
    };
    const plain = drizzleWithoutD1.insert(schema.checklistRuns).values(run).toSQL();
    const guarded = insertRowWhere(drizzleWithoutD1, schema.checklistRuns, run, sql`1 = 1`).toSQL();

    const plainColumns = plain.sql.slice(0, plain.sql.indexOf(' values '));
    expect(guarded.sql.startsWith(`${plainColumns} select `)).toBe(true);
    expect(guarded.sql.endsWith(' where 1 = 1')).toBe(true);
    expect(guarded.params).toEqual(plain.params);
  });

  it('fills a column the row leaves out with its default, SQL defaults included, as a plain insert does', () => {
    const run = { id: 'run-1', user_id: 'user-1', title: 'Run', items: '[]', started_at: 'now', created_at: 'now' };
    const plain = drizzleWithoutD1.insert(schema.checklistRuns).values(run).toSQL();
    const guarded = insertRowWhere(drizzleWithoutD1, schema.checklistRuns, run, sql`1 = 1`).toSQL();

    expectThePlainInsertsValues(guarded, plain);
  });

  it('leaves omitted columns out of the statement, matching a plain insert of the rest', () => {
    const template = { id: 'template-1', user_id: 'user-1', title: 'T', items: '[]', created_at: 'now' };
    const plain = drizzleWithoutD1.insert(withoutColumns(schema.templates, ['rules'])).values(template).toSQL();
    const guarded = insertRowWhere(drizzleWithoutD1, schema.templates, template, sql`1 = 1`, { omitColumns: ['rules'] }).toSQL();

    expect(plain.sql).toMatch(/^insert into "templates" \(/);
    expect(plain.sql).not.toContain('"rules"');
    expect(guarded.sql).not.toContain('"rules"');
    expect(guarded.sql.startsWith(`${plain.sql.slice(0, plain.sql.indexOf(' values '))} select `)).toBe(true);
    expect(guarded.params).toEqual(plain.params);
    const plainInsertIntoTheUnchangedTable = drizzleWithoutD1.insert(schema.templates).values(template).toSQL().sql;
    expect(plainInsertIntoTheUnchangedTable).toContain('"rules"');
  });

  it('fills columns from their default functions and SQL values, and leaves out a column the database generates, as a plain insert does', () => {
    const widgets = sqliteTable('widgets', {
      id: text('id').primaryKey(),
      made: text('made').$defaultFn(() => 'made by its default function'),
      madeAt: text('made_at').$defaultFn(() => sql`CURRENT_TIMESTAMP`),
      touched: text('touched').$onUpdateFn(() => 'touched by its update function'),
      stamped: text('stamped').$type<SQL>(),
      left: text('left'),
      doubled: integer('doubled').generatedAlwaysAs(sql`1 + 1`),
    });
    const widget = { id: 'widget-1', stamped: sql`CURRENT_TIMESTAMP` };
    const plain = drizzleWithoutD1.insert(widgets).values(widget).toSQL();
    const guarded = insertRowWhere(drizzleWithoutD1, widgets, widget, sql`1 = 1`).toSQL();

    expect(plain.sql).not.toContain('"doubled"');
    expect(guarded.sql.slice(0, guarded.sql.indexOf(' select '))).toBe(plain.sql.slice(0, plain.sql.indexOf(' values ')));
    expectThePlainInsertsValues(guarded, plain);
    expect(guarded.params).toEqual(['widget-1', 'made by its default function', 'touched by its update function']);
  });

  it('fills a column whose default is null with null', () => {
    const notes = sqliteTable('notes', { id: text('id').primaryKey(), body: text('body').$type<string | null>().default(null) });

    const guarded = insertRowWhere(drizzleWithoutD1, notes, { id: 'note-1' }, sql`1 = 1`).toSQL();

    expect(guarded).toEqual({ sql: 'insert into "notes" ("id", "body") select ?, null where 1 = 1', params: ['note-1'] });
  });

  it('guards a run insert on the active-run count for its context', () => {
    const condition = activeRunCapacityAvailableSql({ userId: 'user-1', teamId: null }, 3);
    const query = insertRowWhere(drizzleWithoutD1, schema.checklistRuns, {
      id: 'run-1', user_id: 'user-1', title: 'Run', items: '[]', started_at: 'now', created_at: 'now',
    }, condition).toSQL();

    expect(query.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where \(.*"checklist_runs"."status" = \?.*\)\) < \?$/);
    expect(query.params.slice(-3)).toEqual(['user-1', 'in_progress', 3]);
  });

  it('guards a companion row on the existence of the new row', () => {
    const query = insertRowWhere(drizzleWithoutD1, schema.auditEvents, {
      id: 'audit-1',
      subject_type: 'user',
      subject_id: 'user-1',
      resource_type: 'checklist_run',
      resource_id: 'run-1',
      action: 'checklist_run.created',
      created_at: 'now',
    }, rowExistsSql(schema.checklistRuns.id, 'run-1')).toSQL();

    expect(query.sql).toMatch(/where exists \(select 1 from "checklist_runs" where "checklist_runs"."id" = \?\)$/);
    expect(query.params.at(-1)).toBe('run-1');
  });
});

describe('withoutColumns', () => {
  it('refuses a table that does not keep its columns where this Drizzle version does', () => {
    const widgets = sqliteTable('widgets', { id: text('id').primaryKey(), note: text('note') });
    Reflect.deleteProperty(widgets, Symbol.for('drizzle:Columns'));

    expect(() => withoutColumns(widgets, ['note'])).toThrow('withoutColumns: unsupported Drizzle table layout');
  });
});

describe('allConditions', () => {
  it('refuses to build a guard from no condition at all', () => {
    expect(() => allConditions()).toThrow('allConditions: pass at least one condition');
    expect(() => allConditions(undefined)).toThrow('allConditions: pass at least one condition');
  });
});
