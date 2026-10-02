import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { createDb } from '@functions/api/db';
import { selectPublicProfileTemplates } from '@functions/api/handlers/template-reads';
import { selectAuditEventHistory, selectTemplateVersionHistory } from '@functions/api/utils/history-queries';
import { apiEnv, d1ThatRunsNoQuery } from '../../../support/apiEnv';
import { SqliteD1, toSqliteValue } from '../../../support/sqlite-d1';

const migratedDatabase = (): DatabaseSync => new SqliteD1().sqlite;

type BuiltQuery = { toSQL(): { sql: string; params: unknown[] } };

const drizzleDb = createDb(apiEnv({ DB: d1ThatRunsNoQuery() }));

function explain(db: DatabaseSync, query: BuiltQuery): string {
  const { sql, params } = query.toSQL();
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params.map(toSqliteValue));
  return rows.map(({ detail }) => detail).join('; ');
}

describe('history query plans from the real migrations and Drizzle SQL, which fail when a query sorts every row before LIMIT', () => {
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
    const createdAtOutOfVersionOrder = (version: number) => `2026-01-01T00:00:${String(version % 60).padStart(2, '0')}Z`;
    for (let version = 1; version <= 300; version += 1) {
      insert.run(`version-${version}`, version, createdAtOutOfVersionOrder(version));
    }

    const { sql, params } = selectTemplateVersionHistory(drizzleDb, 'template-1', 8).toSQL();
    const rows = db.prepare(sql).all(...params.map(toSqliteValue));

    expect(rows.map((row) => Object.values(row)[1])).toEqual([300, 299, 298, 297, 296, 295, 294, 293]);
  });
});

describe('public profile template query plan', () => {
  it("reads a Creator's public templates from the owner index, not by scanning every public template", () => {
    const db = migratedDatabase();
    const plan = explain(db, selectPublicProfileTemplates(apiEnv({ DB: d1ThatRunsNoQuery() }), 'user-1', true));

    expect(plan).toContain('idx_templates_owner');
    expect(plan).not.toContain('idx_templates_public_created_at');
  });
});
