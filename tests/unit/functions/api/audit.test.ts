import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createDb, schema } from '@functions/api/db';
import { buildAuditEventValues, insertAuditEventWhen, type AuditEventInput } from '@functions/api/utils/audit';

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

// D1 rejects rows over 2,000,000 bytes, and the audit insert shares a batch with the write it
// records, so an oversized audit row rolls back the save itself. Audit rows must stay small.

const ROW_BUDGET_BYTES = 300 * 1024;
const bytes = (value: string | null | undefined) => new TextEncoder().encode(value ?? '').byteLength;

function rowBytes(values: Awaited<ReturnType<typeof buildAuditEventValues>>): number {
  return Object.values(values).reduce<number>(
    (total, value) => total + (typeof value === 'string' ? bytes(value) : 8),
    0,
  );
}

function bigSections(itemCount: number, completedIds: string[] = []) {
  return [{
    id: 'section-1',
    title: 'Large SOP',
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index}`,
      title: `Step ${index}`,
      description: 'Read the "full" procedure carefully before continuing. '.repeat(20),
      isCompleted: completedIds.includes(`item-${index}`),
      contents: [{ id: `c-${index}`, type: 'subItems', value: '', subItems: [{ id: `sub-${index}`, title: 'Check', isCompleted: false }] }],
    })),
  }];
}

function runRow(items: string) {
  return {
    id: 'run-1',
    user_id: 'user-1',
    team_id: null,
    title: 'Run',
    items,
    retired_items: items,
    status: 'in_progress',
    progress: 0,
    revision: 4,
    share_token: 'secret-share-token',
    is_public: true,
  };
}

function input(overrides: Partial<AuditEventInput>): AuditEventInput {
  return {
    actorUserId: 'user-1',
    subject: { type: 'user', id: 'user-1' },
    resource: { type: 'checklist_run', id: 'run-1' },
    action: 'checklist_run.updated',
    ...overrides,
  };
}

describe('buildAuditEventValues', () => {
  it('stores a run save of about 900 KB as a compact row that names only the toggled task', async () => {
    const before = JSON.stringify(bigSections(700));
    const after = JSON.stringify(bigSections(700, ['item-42']));
    expect(bytes(after)).toBeGreaterThan(900_000);
    const updates = { items: after, progress: 1, revision: 5 };

    const values = await buildAuditEventValues(input({
      before: runRow(before),
      after: { ...runRow(before), ...updates },
      diff: updates,
    }));

    expect(rowBytes(values)).toBeLessThan(ROW_BUDGET_BYTES);
    for (const column of [values.before_json, values.after_json]) {
      const snapshot = JSON.parse(column ?? '{}');
      expect(snapshot).not.toHaveProperty('items');
      expect(snapshot).not.toHaveProperty('retired_items');
      expect(snapshot).not.toHaveProperty('share_token');
      expect(snapshot).toEqual(expect.objectContaining({ id: 'run-1', status: 'in_progress' }));
    }
    const diff = JSON.parse(values.diff_json ?? '{}');
    expect(diff).toEqual({
      items: { sections: 1, items: 700, completed: ['item-42'] },
      progress: 1,
      revision: 5,
    });
  });

  it('records completion, notes, sub-item, added, removed, and edited tasks by id only', async () => {
    const before = [{ id: 's', items: [
      { id: 'a', title: 'A', isCompleted: true },
      { id: 'b', title: 'B', notes: 'old private note' },
      { id: 'c', title: 'C', subItems: [{ id: 'c1', isCompleted: false }] },
      { id: 'gone', title: 'Gone' },
    ] }];
    const after = [{ id: 's', items: [
      { id: 'a', title: 'A', isCompleted: false },
      { id: 'b', title: 'B', notes: 'new private note' },
      { id: 'c', title: 'C renamed', subItems: [{ id: 'c1', isCompleted: true }] },
      { id: 'new', title: 'New' },
    ] }];

    const values = await buildAuditEventValues(input({
      before: { items: JSON.stringify(before) },
      diff: { items: JSON.stringify(after) },
    }));

    expect(JSON.parse(values.diff_json ?? '{}').items).toEqual({
      sections: 1,
      items: 4,
      completed: ['c/c1'],
      reopened: ['a'],
      notesChanged: ['b'],
      edited: ['c'],
      added: ['new'],
      removed: ['gone'],
    });
    expect(values.diff_json).not.toContain('private note');
  });

  it('summarizes retired entries and redacts share tokens in the diff', async () => {
    const values = await buildAuditEventValues(input({
      diff: { retired_items: JSON.stringify([{ kind: 'item' }, { kind: 'item' }]), share_token: 'secret-share-token', is_public: true },
    }));

    expect(JSON.parse(values.diff_json ?? '{}')).toEqual({ retired_items: { count: 2 }, share_token: '[redacted]', is_public: true });
  });

  it('truncates any oversized column to a marker, measuring UTF-8 bytes rather than characters', async () => {
    const multibyte = '漢'.repeat(30_000); // 30,000 characters, 90,000 bytes
    const values = await buildAuditEventValues(input({ metadata: { note: multibyte } }));

    const marker = JSON.parse(values.metadata_json ?? '{}');
    expect(marker).toEqual({ truncated: true, bytes: expect.any(Number), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(marker.bytes).toBeGreaterThan(90_000);
    expect(bytes(values.metadata_json)).toBeLessThan(200);
  });

  it('keeps every column under budget for multi-megabyte inputs', async () => {
    const huge = 'x'.repeat(1_500_000);
    const values = await buildAuditEventValues(input({
      before: { blob: huge },
      after: { blob: huge },
      diff: { blob: huge },
      metadata: { blob: huge },
      request: new Request('http://localhost', { headers: { 'User-Agent': 'u'.repeat(20_000) } }),
    }));

    expect(rowBytes(values)).toBeLessThan(ROW_BUDGET_BYTES);
    expect(values.action).toBe('checklist_run.updated');
    expect(values.resource_id).toBe('run-1');
  });

  it('leaves small payloads unchanged', async () => {
    const values = await buildAuditEventValues(input({
      before: { status: 'in_progress', title: 'Run' },
      after: { status: 'completed', title: 'Run' },
      diff: { status: 'completed' },
      metadata: { source: 'test' },
    }));

    expect(values.before_json).toBe('{"status":"in_progress","title":"Run"}');
    expect(values.after_json).toBe('{"status":"completed","title":"Run"}');
    expect(values.diff_json).toBe('{"status":"completed"}');
    expect(values.metadata_json).toBe('{"source":"test"}');
  });
});
