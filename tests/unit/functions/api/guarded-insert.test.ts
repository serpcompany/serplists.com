import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { schema } from '@functions/api/db';
import { insertRowWhere, rowExistsSql } from '@functions/api/utils/guarded-insert';
import { activeRunCapacityAvailableSql } from '@functions/api/utils/active-run-limit';

// Builds SQL only; nothing is executed.
const db = drizzle({} as D1Database, { schema });

describe('insertRowWhere', () => {
  it('writes the same columns and values as a plain insert, behind the condition', () => {
    const run = {
      id: 'run-1',
      user_id: 'user-1',
      title: 'Run',
      items: '[]',
      started_at: 'now',
      created_at: 'now',
      is_public: true,
    };
    const plain = db.insert(schema.checklist_runs).values(run).toSQL();
    const guarded = insertRowWhere(db as never, schema.checklist_runs, run, sql`1 = 1`).toSQL();

    const plainColumns = plain.sql.slice(0, plain.sql.indexOf(' values '));
    expect(guarded.sql.startsWith(`${plainColumns} select `)).toBe(true);
    expect(guarded.sql.endsWith(' where 1 = 1')).toBe(true);
    // Booleans are encoded through the column (true -> 1), and defaults match the plain insert.
    expect(guarded.params).toEqual(plain.params);
  });

  it('guards a run insert on the active-run count for its context', () => {
    const condition = activeRunCapacityAvailableSql({ userId: 'user-1', teamId: null }, 3);
    const query = insertRowWhere(db as never, schema.checklist_runs, {
      id: 'run-1', user_id: 'user-1', title: 'Run', items: '[]', started_at: 'now', created_at: 'now',
    }, condition).toSQL();

    expect(query.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where \(.*"checklist_runs"."status" = \?.*\)\) < \?$/);
    expect(query.params.slice(-3)).toEqual(['user-1', 'in_progress', 3]);
  });

  it('guards a companion row on the existence of the new row', () => {
    const query = insertRowWhere(db as never, schema.audit_events, {
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
