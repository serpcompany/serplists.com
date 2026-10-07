import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { findStoredSectionsIssue } from '@/lib/schemas/storedSections';
import { malformedSectionsStoredBeforeValidation } from '../../fixtures/malformedSections';
import { SqliteD1 } from '../../support/sqlite-d1';

const query = readFileSync(new URL('../../../db/maintenance/find-malformed-checklist-content.sql', import.meta.url), 'utf8');

function migratedDatabase(): DatabaseSync {
  const db = new SqliteD1().sqlite;
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

const findingRows = z.array(
  z.object({ source: z.string(), id: z.string(), path: z.string(), problem: z.string() }).passthrough(),
);

const findings = (db: DatabaseSync) => findingRows.parse(db.prepare(query.replace(/^--.*$/gm, '')).all());

const validSections = [
  {
    id: 's1',
    title: 'Launch',
    items: [
      { id: 'i1', title: 'Legacy', completed: true, notes: 'Run notes', subItems: [{ id: 'a', title: 'A' }] },
      { id: 'i2', title: 'Blocks', description: null, contents: [
        { type: 'subItems', value: '', subItems: [{ title: 'No id' }] },
        { type: 'file', value: 'https://x.test/f.pdf', fileName: 'f.pdf', fileSize: 12, uploadType: 'upload' },
        { type: 'form', value: '', fields: [
          { id: 'f1', label: 'Name', kind: 'text', required: true, description: 'Legal name', answer: 'Acme' },
          { id: 'f2', label: 'Notes', kind: 'longText', answer: null },
          { id: 'f3', label: 'Site', kind: 'url', answer: 'https://acme.test' },
          { id: 'f4', label: 'Email', kind: 'email' },
          { id: 'f5', label: 'Seats', kind: 'number', min: 1, max: 9.5, answer: 3 },
          { id: 'f6', label: 'Start', kind: 'date', answer: '2026-10-06' },
          { id: 'f7', label: 'Plan', kind: 'select', options: [{ id: 'o1', label: 'Pro' }], answer: 'o1' },
          { id: 'f8', label: 'Tags', kind: 'multiSelect', options: [{ id: 'o1', label: 'A' }], answer: ['o1'] },
          { id: 'f9', label: 'Agree', kind: 'checkbox', required: false, answer: true },
          { id: 'f10', label: 'Brief', kind: 'file', answer: { url: '/api/uploads/file?key=a', fileName: 'a.pdf', fileSize: 3 } },
        ] },
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

  it.each(malformedSectionsStoredBeforeValidation)('finds a run with %s', (_label, sections) => {
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

  it('names the form field and what is wrong with it', () => {
    const db = migratedDatabase();
    insertRun(db, 'run-form', JSON.stringify([{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [
      { type: 'form', value: '', fields: [
        { id: 'f1', label: 'Color', kind: 'color' },
        { id: 'f2', label: 'Seats', kind: 'number', answer: 'five' },
        { id: 'f3', label: 'Tags', kind: 'multiSelect', options: [{ id: 'a', label: 'A' }], answer: ['a', 2] },
      ] },
    ] }] }]));

    expect(findings(db)).toEqual([
      { source: 'checklist_runs', id: 'run-form', path: '$[0].items[0].contents[0].fields[0]', problem: 'unknown or missing form field kind' },
      { source: 'checklist_runs', id: 'run-form', path: '$[0].items[0].contents[0].fields[1]', problem: 'answer does not fit the form field kind' },
      { source: 'checklist_runs', id: 'run-form', path: '$[0].items[0].contents[0].fields[2].answer[1]', problem: 'expected text, found integer' },
    ]);
  });
});
