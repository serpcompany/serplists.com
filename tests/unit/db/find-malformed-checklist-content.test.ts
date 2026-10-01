import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { findStoredSectionsIssue } from '@/lib/schemas/storedSections';
import { hostileSections } from '../../fixtures/malformedSections';
import { createMigratedD1 } from '../../fixtures/sqliteD1';

const query = readFileSync(new URL('../../../db/maintenance/find-malformed-checklist-content.sql', import.meta.url), 'utf8');

function migratedDatabase(): DatabaseSync {
  const db = createMigratedD1().sqlite;
  db.exec(`INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
    VALUES ('user-1', 'owner@example.test', 'Owner', 1, '2026-01-01', '2026-01-01');`);
  return db;
}

function insertTemplate(db: DatabaseSync, id: string, items: string) {
  db.prepare(`INSERT INTO templates (id, user_id, title, items, slug, created_at, owner_type)
    VALUES (?, 'user-1', 'Plan', ?, ?, '2026-01-01', 'user')`).run(id, items, id);
}

function insertRun(db: DatabaseSync, id: string, items: string) {
  db.prepare(`INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at, updated_at)
    VALUES (?, 'user-1', NULL, 'Run', ?, 'in_progress', '2026-01-01', '2026-01-01', '2026-01-01')`).run(id, items);
}

const findings = (db: DatabaseSync) =>
  db.prepare(query.replace(/^--.*$/gm, '')).all() as Array<{ source: string; id: string; path: string; problem: string }>;

const validSections = [
  {
    id: 's1',
    title: 'Launch',
    items: [
      { id: 'i1', title: 'Legacy', completed: true, notes: 'Run notes', subItems: [{ id: 'a', title: 'A' }] },
      { id: 'i2', title: 'Blocks', description: null, contents: [
        { type: 'subItems', value: '', subItems: [{ title: 'No id' }] },
        { type: 'file', value: 'https://x.test/f.pdf', fileName: 'f.pdf', fileSize: 12, uploadType: 'upload' },
      ] },
    ],
  },
];

describe('find-malformed-checklist-content.sql, the read-only maintenance query that finds every shape saves now reject and nothing else', () => {
  it('finds nothing in content the API accepts, including legacy flat rows', () => {
    const db = migratedDatabase();
    expect(findStoredSectionsIssue(validSections)).toBeNull();
    insertTemplate(db, 'template-ok', JSON.stringify(validSections));
    insertTemplate(db, 'template-flat', JSON.stringify([{ id: 'i1', title: 'Flat legacy task' }]));
    insertRun(db, 'run-ok', JSON.stringify(validSections));
    insertRun(db, 'run-empty', '[]');

    expect(findings(db)).toEqual([]);
  });

  it.each(hostileSections)('finds a run with %s', (_label, sections) => {
    const db = migratedDatabase();
    insertRun(db, 'run-bad', JSON.stringify(sections));
    insertRun(db, 'run-ok', JSON.stringify(validSections));

    const rows = findings(db);
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => `${row.source}:${row.id}`))).toEqual(new Set(['checklist_runs:run-bad']));
  });

  it('names the path and the problem, and finds invalid JSON', () => {
    const db = migratedDatabase();
    insertTemplate(db, 'template-bad', JSON.stringify([{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [
      { type: 'subItems', value: '', subItems: 'x' },
    ] }] }]));
    insertRun(db, 'run-broken', '{not json');

    expect(findings(db)).toEqual([
      { source: 'checklist_runs', id: 'run-broken', path: '$', problem: 'invalid JSON' },
      { source: 'templates', id: 'template-bad', path: '$[0].items[0].contents[0].subItems', problem: 'expected an array, found text' },
    ]);
  });
});
