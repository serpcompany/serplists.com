import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createDb } from '@functions/api/db';
import { selectAuditEventHistory, selectTemplateVersionHistory } from '@functions/api/utils/history-queries';

// D1 bills rows scanned. These plans come from the real migrations and the SQL Drizzle
// generates, so a history query that sorts every row before LIMIT fails here.

const migrationsDir = new URL('../../../../db/migrations/', import.meta.url);

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }
  return db;
}

type BuiltQuery = { toSQL(): { sql: string; params: unknown[] } };

const drizzleDb = createDb({ DB: {} } as never);

function explain(db: DatabaseSync, query: BuiltQuery): string {
  const { sql, params } = query.toSQL();
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as Array<string | number>)) as Array<{ detail: string }>;
  return rows.map((row) => row.detail).join('; ');
}

describe('history query plans', () => {
  it('reads template versions from the unique index in order, without sorting', () => {
    const db = migratedDatabase();
    const plan = explain(db, selectTemplateVersionHistory(drizzleDb, 'template-1', 8));

    expect(plan).toContain('idx_template_versions_template_version_unique');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('reads audit events from the resource index in order, without sorting', () => {
    const db = migratedDatabase();
    const plan = explain(db, selectAuditEventHistory(drizzleDb, 'checklist_run', 'run-1', 8));

    expect(plan).toContain('idx_audit_events_resource');
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('returns the newest versions of a heavily edited template', () => {
    const db = migratedDatabase();
    db.exec(`
      INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
      VALUES ('user-1', 'owner@example.test', 'Owner', 1, '2026-01-01', '2026-01-01');
      INSERT INTO templates (id, user_id, title, items, slug, created_at, owner_type)
      VALUES ('template-1', 'user-1', 'Plan', '[]', 'plan', '2026-01-01', 'user');
    `);
    const insert = db.prepare(`INSERT INTO template_versions
      (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
      VALUES (?, 'template-1', ?, 'user-1', 'user', 'user-1', '{}', ?)`);
    // created_at out of order on purpose: version is the order that matters.
    for (let version = 1; version <= 300; version += 1) {
      insert.run(`version-${version}`, version, `2026-01-01T00:00:${String(version % 60).padStart(2, '0')}Z`);
    }

    const { sql, params } = selectTemplateVersionHistory(drizzleDb, 'template-1', 8).toSQL();
    const rows = db.prepare(sql).all(...(params as Array<string | number>)) as Array<Record<string, unknown>>;

    expect(rows.map((row) => Object.values(row)[1])).toEqual([300, 299, 298, 297, 296, 295, 294, 293]);
  });
});
