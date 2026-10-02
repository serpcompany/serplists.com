import { describe, expect, it } from 'vitest';
import { d1ThatRunsNoQuery } from '../../../support/apiEnv';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { schema } from '@functions/api/db';
import { insertRowWhere, rowExistsSql, withoutColumns } from '@functions/api/utils/guarded-insert';
import { activeRunCapacityAvailableSql } from '@functions/api/utils/active-run-limit';

const drizzleWithoutD1 = drizzle(d1ThatRunsNoQuery(), { schema });

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
    const plain = drizzleWithoutD1.insert(schema.checklist_runs).values(run).toSQL();
    const guarded = insertRowWhere(drizzleWithoutD1, schema.checklist_runs, run, sql`1 = 1`).toSQL();

    const plainColumns = plain.sql.slice(0, plain.sql.indexOf(' values '));
    expect(guarded.sql.startsWith(`${plainColumns} select `)).toBe(true);
    expect(guarded.sql.endsWith(' where 1 = 1')).toBe(true);
    expect(guarded.params).toEqual(plain.params);
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

  it('guards a run insert on the active-run count for its context', () => {
    const condition = activeRunCapacityAvailableSql({ userId: 'user-1', teamId: null }, 3);
    const query = insertRowWhere(drizzleWithoutD1, schema.checklist_runs, {
      id: 'run-1', user_id: 'user-1', title: 'Run', items: '[]', started_at: 'now', created_at: 'now',
    }, condition).toSQL();

    expect(query.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where \(.*"checklist_runs"."status" = \?.*\)\) < \?$/);
    expect(query.params.slice(-3)).toEqual(['user-1', 'in_progress', 3]);
  });

  it('guards a companion row on the existence of the new row', () => {
    const query = insertRowWhere(drizzleWithoutD1, schema.audit_events, {
      id: 'audit-1',
      subject_type: 'user',
      subject_id: 'user-1',
      resource_type: 'checklist_run',
      resource_id: 'run-1',
      action: 'checklist_run.created',
      created_at: 'now',
    }, rowExistsSql(schema.checklist_runs.id, 'run-1')).toSQL();

    expect(query.sql).toMatch(/where exists \(select 1 from "checklist_runs" where "checklist_runs"."id" = \?\)$/);
    expect(query.params.at(-1)).toBe('run-1');
  });
});
