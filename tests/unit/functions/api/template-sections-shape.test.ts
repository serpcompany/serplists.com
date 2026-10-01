import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeSectionsPayload } from '@functions/api/utils/payloads';
import {
  assignMissingStableTemplateIdentities,
  reconcileRunSections,
} from '@functions/api/utils/template-reconciliation';
import { isSectionsShape } from '@/lib/utils/checklistSections';
import { SqliteD1 } from '../../../support/sqlite-d1';

const session = vi.hoisted(() => ({ userId: 'user-1' as string | null }));
vi.mock('@functions/api/utils/session', () => ({ getSessionUserId: vi.fn(async () => session.userId) }));

import { handleTemplates } from '@functions/api/handlers/templates';

type Json = Record<string, unknown>;

const onboarding = () => [
  { id: 's1', title: 'Intro', items: null },
  { id: 's2', title: 'Steps', items: [{ id: 'i1', title: 'Create account' }] },
];

const sectionOutline = (sections: unknown[]) => (sections as Json[]).map((section) => ({
  id: section.id,
  title: section.title,
  items: ((section.items ?? []) as Json[]).map((item) => item.id),
}));

describe('a first section with items: null, which every reader takes as sections rather than tasks of one Checklist section', () => {
  it('keeps its sections when stable ids are assigned', () => {
    expect(sectionOutline(assignMissingStableTemplateIdentities(onboarding()))).toEqual([
      { id: 's1', title: 'Intro', items: [] },
      { id: 's2', title: 'Steps', items: ['i1'] },
    ]);
  });

  it.each([
    ['the run', [{ id: 's1', title: 'Intro', items: null }], [{ id: 's1', title: 'Intro', items: [] }]],
    ['the Template', [{ id: 's1', title: 'Intro', items: [] }], [{ id: 's1', title: 'Intro', items: null }]],
  ])('keeps run state when %s stores it', (_label, runFirst, templateFirst) => {
    const run = [...runFirst, { id: 's2', title: 'Steps', items: [{ id: 'i1', title: 'Create account', isCompleted: true, notes: 'Done' }] }];
    const template = [...templateFirst, { id: 's2', title: 'Steps', items: [{ id: 'i1', title: 'Create account' }] }];

    const result = reconcileRunSections(run, template, []);

    expect(result.newlyRetired).toEqual([]);
    expect(result.retired).toEqual([]);
    expect(sectionOutline(result.sections)).toEqual([
      { id: 's1', title: 'Intro', items: [] },
      { id: 's2', title: 'Steps', items: ['i1'] },
    ]);
    expect(result.sections[1].items).toEqual([expect.objectContaining({ id: 'i1', isCompleted: true, notes: 'Done' })]);
  });

  it.each([
    ['sections', [{ id: 's1', title: 'A', items: [{ id: 'i1', title: 'Task' }] }], true],
    ['sections, the first with items: null', [{ id: 's1', title: 'A', items: null }, { id: 's2', title: 'B', items: [] }], true],
    ['sections, the first with items: []', [{ id: 's1', title: 'A', items: [] }], true],
    ['a flat task list', [{ id: 'i1', title: 'Task' }, { id: 'i2', title: 'Task 2' }], false],
  ])('reads %s as sections or a legacy flat task list the same way in every reader', (_label, list, sectioned) => {
    const wrapped = (sections: unknown[]) => sections.length === 1 && (sections[0] as Json).title === 'Checklist'
      && (sections[0] as Json).id === '1';

    expect(isSectionsShape(list)).toBe(sectioned);
    expect(wrapped(normalizeSectionsPayload(list).sections)).toBe(!sectioned);
    expect(wrapped(assignMissingStableTemplateIdentities(list))).toBe(!sectioned);
  });
});

describe('saving a Template whose first section has items: null', () => {
  const createdAt = '2026-01-01T00:00:00.000Z';
  let d1: SqliteD1;

  const env = () => ({ DB: d1.binding, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' }) as never;
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await handleTemplates(new Request(`http://localhost/api/templates${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env());
    return { status: response.status, data: await response.json() as Json };
  };

  beforeEach(() => {
    d1 = new SqliteD1();
    session.userId = 'user-1';
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'one@example.test', 'One', 1, ?)", createdAt);
  });

  it('stores and returns the sections it was sent', async () => {
    const created = await call('POST', '', { title: 'Onboarding', sections: onboarding() });
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    const id = String(created.data.id ?? (created.data.template as Json | undefined)?.id);

    const fetched = await call('GET', `/${id}`);
    expect(fetched.status).toBe(200);
    expect(sectionOutline(fetched.data.sections as unknown[])).toEqual([
      { id: 's1', title: 'Intro', items: [] },
      { id: 's2', title: 'Steps', items: ['i1'] },
    ]);
  });

  it('leaves active runs alone when the same sections are saved with items: null', async () => {
    const sent = onboarding();
    const created = await call('POST', '', { title: 'Onboarding', sections: [{ ...sent[0], items: [] }, sent[1]] });
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    const id = String(created.data.id ?? (created.data.template as Json | undefined)?.id);
    const template = d1.rows<{ version: number; content_version: number }>(
      'SELECT version, content_version FROM templates WHERE id = ?', id,
    )[0];
    const runItems = JSON.stringify([
      { id: 's1', title: 'Intro', items: [] },
      { id: 's2', title: 'Steps', items: [{ id: 'i1', title: 'Create account', isCompleted: true, notes: 'Done' }] },
    ]);
    d1.run(
      `INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at, updated_at,
         progress, is_public, template_version, revision, retired_items)
       VALUES ('run-1', 'user-1', ?, 'Onboarding', ?, 'in_progress', ?, ?, ?, 100, 0, ?, 1, '[]')`,
      id, runItems, createdAt, createdAt, createdAt, template.content_version,
    );

    const saved = await call('PUT', `/${id}`, { title: 'Onboarding', sections: onboarding(), expected_version: template.version });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);

    expect(d1.rows('SELECT content_version FROM templates WHERE id = ?', id)).toEqual([
      { content_version: template.content_version },
    ]);
    expect(d1.rows("SELECT items, retired_items FROM checklist_runs WHERE id = 'run-1'")).toEqual([
      { items: runItems, retired_items: '[]' },
    ]);
  });
});
