import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { storedSectionsIn } from '../../../support/storedJson';
import { contentAt, firstOf, present, subTaskAt, taskIn } from '../../../support/elements';
import type { StoredRow } from '../../../support/d1Doubles';

const migration = readFileSync(
  new URL('../../../../db/migrations/0024_safe_template_evolution.sql', import.meta.url),
  'utf8',
);

describe('safe template evolution migration', () => {
  it('backfills matching legacy identities and conservatively stales every linked snapshot', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        items TEXT NOT NULL
      );
      CREATE TABLE checklist_runs (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        items TEXT NOT NULL,
        status TEXT,
        deleted_at TEXT,
        is_public INTEGER
      );
    `);

    const templateItems = JSON.stringify([{
      title: 'Section',
      items: [{
        title: 'Task',
        subItems: [{ title: 'Direct sub-item' }],
        contents: [{ type: 'subItems', subItems: [{ title: 'Nested sub-item' }] }],
      }],
    }]);
    const runItems = JSON.stringify([{
      title: 'Section',
      items: [{
        title: 'Task',
        isCompleted: true,
        notes: 'Keep this state',
        subItems: [{ title: 'Direct sub-item', isCompleted: true }],
        contents: [{ type: 'subItems', subItems: [{ title: 'Nested sub-item' }] }],
      }],
    }]);
    db.prepare('INSERT INTO templates(id, version, items) VALUES (?, ?, ?)')
      .run('template-1', 4, templateItems);
    const insertRun = db.prepare(
      'INSERT INTO checklist_runs(id, template_id, items, status, deleted_at, is_public) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertRun.run('active', 'template-1', runItems, 'in_progress', null, 0);
    insertRun.run('completed', 'template-1', runItems, 'completed', null, 0);
    insertRun.run('archived', 'template-1', runItems, 'in_progress', '2026-09-01T00:00:00Z', 0);
    insertRun.run('shared', 'template-1', runItems, 'in_progress', null, 1);
    insertRun.run('orphan', null, runItems, 'completed', null, 0);

    db.exec(migration);

    const template: StoredRow = present(db.prepare('SELECT items, version, content_version FROM templates').get(), 'the template');
    const templateStructure = storedSectionsIn(template.items);
    const templateTask = taskIn(templateStructure, 0, 0);
    expect(template.content_version).toBe(5);
    expect(template.version).toBe(5);
    expect(firstOf(templateStructure).id).toBe('legacy-section-1');
    expect(templateTask.id).toBe('legacy-item-1-1');
    expect(subTaskAt(templateTask, 0).id).toBe('legacy-subitem-1-1-1');
    expect(subTaskAt(contentAt(templateTask, 0), 0).id).toBe('legacy-subitem-1-1-2');

    const runs: StoredRow[] = db.prepare('SELECT id, items, template_version FROM checklist_runs ORDER BY id').all();
    for (const run of runs.filter((candidate) => candidate.id !== 'orphan')) {
      const structure = storedSectionsIn(run.items);
      expect(run.template_version).toBe(0);
      expect(firstOf(structure).id).toBe('legacy-section-1');
      expect(taskIn(structure, 0, 0)).toMatchObject({
        id: 'legacy-item-1-1',
        isCompleted: true,
        notes: 'Keep this state',
      });
    }
    expect(runs.find((run) => run.id === 'orphan')?.template_version).toBe(1);

    db.close();
  });

  it('normalizes legacy flat arrays before assigning matching template and run identities', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        items TEXT NOT NULL
      );
      CREATE TABLE checklist_runs (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        items TEXT NOT NULL,
        status TEXT,
        deleted_at TEXT,
        is_public INTEGER
      );
    `);

    db.prepare('INSERT INTO templates(id, version, items) VALUES (?, ?, ?)').run(
      'flat-template',
      2,
      JSON.stringify([{ title: 'Legacy task' }]),
    );
    db.prepare(
      'INSERT INTO checklist_runs(id, template_id, items, status, deleted_at, is_public) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      'flat-run',
      'flat-template',
      JSON.stringify([{ title: 'Legacy task', isCompleted: true, notes: 'Preserve me' }]),
      'completed',
      null,
      0,
    );

    db.exec(migration);

    const template: StoredRow = present(db.prepare("SELECT items FROM templates WHERE id = 'flat-template'").get(), 'the template');
    const run: StoredRow = present(db.prepare("SELECT items, template_version FROM checklist_runs WHERE id = 'flat-run'").get(), 'the run');
    const templateSections = storedSectionsIn(template.items);
    const runSections = storedSectionsIn(run.items);

    expect(templateSections).toEqual([
      expect.objectContaining({
        id: '1',
        title: 'Checklist',
        items: [expect.objectContaining({ id: 'legacy-item-1-1', title: 'Legacy task' })],
      }),
    ]);
    expect(runSections).toEqual([
      expect.objectContaining({
        id: '1',
        items: [expect.objectContaining({
          id: 'legacy-item-1-1',
          isCompleted: true,
          notes: 'Preserve me',
        })],
      }),
    ]);
    expect(run.template_version).toBe(0);

    db.close();
  });
});
