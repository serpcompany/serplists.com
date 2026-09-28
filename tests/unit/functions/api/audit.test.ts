import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createDb, schema } from '@functions/api/db';
import { buildAuditEventValues, insertAuditEventWhen } from '@functions/api/utils/audit';

// Runs the SQL Drizzle generates against the real migrations, the way a D1 batch runs it.
const migrationsDir = new URL('../../../../db/migrations/', import.meta.url);
const drizzleDb = createDb({ DB: {} } as never);

type BuiltQuery = { toSQL(): { sql: string; params: unknown[] } };
type SqlParam = string | number | null;

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }
  db.exec(`
    INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
    VALUES ('user-1', 'owner@example.test', 'Owner', 1, '2026-01-01', '2026-01-01');
    INSERT INTO templates (id, user_id, title, items, slug, created_at, owner_type)
    VALUES ('template-1', 'user-1', 'Plan', '[]', 'plan', '2026-01-01', 'user');
    INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, revision, started_at, created_at, updated_at)
    VALUES ('run-1', 'user-1', 'template-1', 'Run', '[]', 'in_progress', 4, '2026-01-01', '2026-01-01', '2026-01-01');
  `);
  return db;
}

function run(db: DatabaseSync, query: BuiltQuery): number {
  const { sql: text, params } = query.toSQL();
  return Number(db.prepare(text).run(...(params as SqlParam[])).changes);
}

async function reconcileStatements(expectedRevision: number) {
  const { checklist_runs } = schema;
  const whereClause = and(
    eq(checklist_runs.id, 'run-1'),
    eq(checklist_runs.revision, expectedRevision),
    eq(checklist_runs.status, 'in_progress'),
    isNull(checklist_runs.deleted_at),
  );
  const auditEvent = await buildAuditEventValues({
    actorUserId: 'user-1',
    subject: { type: 'user', id: 'user-1' },
    resource: { type: 'checklist_run', id: 'run-1' },
    action: 'checklist_run.reconciled',
    metadata: { retired: [{ kind: 'item', id: 'item-dns', title: 'Check DNS' }] },
    createdAt: '2026-02-01T00:00:00.000Z',
  });
  return {
    auditInsert: insertAuditEventWhen(drizzleDb, auditEvent, sql`exists (select 1 from ${checklist_runs} where ${whereClause})`),
    runUpdate: drizzleDb.update(checklist_runs).set({ revision: expectedRevision + 1, updated_at: '2026-02-01' }).where(whereClause),
  };
}

const events = (db: DatabaseSync) =>
  db.prepare(`SELECT action, resource_id, metadata_json FROM audit_events`).all() as Array<Record<string, string>>;

describe('insertAuditEventWhen', () => {
  it('records the event when the guarded write applies', async () => {
    const db = migratedDatabase();
    const { auditInsert, runUpdate } = await reconcileStatements(4);

    expect(run(db, auditInsert)).toBe(1);
    expect(run(db, runUpdate)).toBe(1);
    expect(events(db)).toEqual([
      expect.objectContaining({ action: 'checklist_run.reconciled', resource_id: 'run-1' }),
    ]);
    expect(JSON.parse(events(db)[0].metadata_json).retired[0].id).toBe('item-dns');
  });

  it('records nothing when the guarded write misses', async () => {
    const db = migratedDatabase();
    // Someone saved the run after it was read: its revision moved on.
    const { auditInsert, runUpdate } = await reconcileStatements(3);

    expect(run(db, auditInsert)).toBe(0);
    expect(run(db, runUpdate)).toBe(0);
    expect(events(db)).toEqual([]);
  });
});
