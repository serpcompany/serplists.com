import { assert, describe, it, expect, beforeEach, vi } from 'vitest';
import { elementAt, firstOf, subTaskAt, taskIn } from '../../../support/elements';
import { dbMocks, EVERY_GUARDED_WRITE_APPLIED, mockEnv, PRO_PLAN, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { withoutKeys } from '../../../support/guestState';
import { jsonObject, readJson } from '../../../support/readJson';

const storedSections = [
  {
    id: 'section-1',
    title: 'Launch',
    items: [
      {
        id: 'item-1',
        title: 'Write the brief',
        description: 'Owner instructions',
        isCompleted: false,
        contents: [
          { id: 'content-1', type: 'text', value: 'Read the style guide first.' },
          {
            id: 'content-2',
            type: 'subItems',
            value: '',
            subItems: [
              { id: 'sub-1', title: 'Outline', isCompleted: false },
              { id: 'sub-2', title: 'Draft', isCompleted: false },
            ],
          },
        ],
      },
      { id: 'item-2', title: 'Publish', isCompleted: false },
    ],
  },
];

function sharedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shared-run',
    template_id: 'template-2',
    title: 'Shared Run',
    status: 'in_progress',
    progress: 0,
    items: JSON.stringify(storedSections),
    retired_items: '[]',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    user_id: 'owner-123',
    team_id: null,
    share_token: 'shared-run',
    is_public: true,
    revision: 3,
    ...overrides,
  };
}

function sectionsTheSharePageRendered() {
  return structuredClone(storedSections);
}

function contentsOfTheFirstTask(sections: typeof storedSections) {
  const { contents } = taskIn(sections, 0, 0);
  assert.exists(contents);
  return contents;
}

function sectionsWithEveryTaskAndSubTaskTicked() {
  const sections = sectionsTheSharePageRendered();
  for (const item of firstOf(sections).items) {
    item.isCompleted = true;
    for (const content of item.contents ?? []) {
      for (const subItem of content.subItems ?? []) subItem.isCompleted = true;
    }
  }
  return sections;
}

async function putShared(body: unknown) {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run', {
    method: 'PUT',
    body: JSON.stringify(body),
  }), mockEnv);
  return { response, data: await readJson(response, jsonObject) };
}

function storedUpdate(): Record<string, unknown> {
  expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(1);
  return firstOf(dbMocks.updateChain.set.mock.calls)[0];
}

const stripGuestState = (value: unknown) => withoutKeys(value, ['isCompleted', 'notes']);

async function expectIncompleteAndRefused(sections: unknown, openTaskCount: number) {
  const { response, data } = await putShared({ ...(sections === undefined ? {} : { sections }), status: 'completed', expected_revision: 3 });

  expect(response.status).toBe(409);
  expect(data).toEqual(expect.objectContaining({ code: 'run_incomplete', details: { openTaskCount } }));
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

describe('shared run updates, which take only completion and notes from a guest onto the stored structure', () => {
  beforeEach(() => {
    resetChecklistsHandlerMocks();
    dbMocks.db.batch.mockResolvedValue(EVERY_GUARDED_WRITE_APPLIED);
  });

  it('keeps the stored tasks when a guest sends an empty sections list', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({ sections: [], expected_revision: 3 });

    expect(response.status).toBe(200);
    expect(JSON.parse(storedUpdate().items as string)).toEqual(storedSections);
  });

  it('keeps the stored tasks when a guest sends a section with no items', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(storedUpdate().items as string)).toEqual(storedSections);
  });

  it('applies only completion from a payload that also rewrites titles, contents, and adds tasks', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = sectionsTheSharePageRendered();
    firstOf(sections).title = 'Hacked section';
    taskIn(sections, 0, 0).title = 'Log in here';
    taskIn(sections, 0, 0).description = 'Visit https://attacker.example';
    taskIn(sections, 0, 0).isCompleted = true;
    firstOf(contentsOfTheFirstTask(sections)).value = '[Log in](https://attacker.example)';
    (taskIn(sections, 0, 0).contents as unknown[]).push({ type: 'file', value: 'https://attacker.example/x.exe' });
    (firstOf(sections).items as unknown[]).push({ id: 'item-99', title: 'Injected', isCompleted: true });
    (sections as unknown[]).push({ id: 'section-99', title: 'Injected', items: [{ id: 'item-98', title: 'Injected' }] });

    const { response } = await putShared({ sections, title: 'Renamed run', expected_revision: 3 });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update).not.toHaveProperty('title');
    const saved = JSON.parse(update.items as string);
    expect(stripGuestState(saved)).toEqual(stripGuestState(storedSections));
    expect(saved[0].items[0].isCompleted).toBe(true);
    expect(saved[0].items[1].isCompleted).toBe(false);
    expect(JSON.stringify(saved)).not.toContain('attacker.example');
  });

  it('stores server-computed progress and ignores client progress and completed_at', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response, data } = await putShared({
      sections: sectionsTheSharePageRendered(),
      progress: 100,
      completed_at: '2020-01-01T00:00:00.000Z',
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.progress).toBe(0);
    expect(update).not.toHaveProperty('completed_at');
    expect(data.progress).toBe(0);
  });

  it('sets completed_at on the server when a guest completes the run', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({
      sections: sectionsWithEveryTaskAndSubTaskTicked(),
      status: 'completed',
      completed_at: '2020-01-01T00:00:00.000Z',
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.status).toBe('completed');
    expect(update.completed_at).not.toBe('2020-01-01T00:00:00.000Z');
    expect(typeof update.completed_at).toBe('string');
    expect(typeof update.share_used_at).toBe('string');
    expect(update.progress).toBe(100);
  });

  it('keeps completed_at and the completer when a guest reopens the run', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(PRO_PLAN);
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      status: 'completed',
      completed_at: '2026-02-01T00:00:00.000Z',
      completed_by_user_id: 'owner-123',
    })]);

    const { response } = await putShared({ status: 'in_progress', expected_revision: 3 });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.status).toBe('in_progress');
    expect(update).not.toHaveProperty('completed_at');
    expect(update).not.toHaveProperty('completed_by_user_id');
  });

  it('restamps a reopened run on the next completion and does not keep the previous completer, naming nobody for an anonymous guest', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      items: JSON.stringify(sectionsWithEveryTaskAndSubTaskTicked()),
      status: 'in_progress',
      completed_at: '2026-02-01T00:00:00.000Z',
      completed_by_user_id: 'owner-123',
    })]);

    const { response } = await putShared({ status: 'completed', expected_revision: 3 });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update.status).toBe('completed');
    expect(update.completed_at).not.toBe('2026-02-01T00:00:00.000Z');
    expect(typeof update.completed_at).toBe('string');
    expect(update).toHaveProperty('completed_by_user_id', null);
  });

  it('names a signed-in owner who completes the run through its share link', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('owner-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      completed_by_user_id: 'someone-else',
      items: JSON.stringify(sectionsWithEveryTaskAndSubTaskTicked()),
    })]);

    const { response } = await putShared({ status: 'completed', expected_revision: 3 });

    expect(response.status).toBe(200);
    expect(storedUpdate().completed_by_user_id).toBe('owner-123');
  });

  it('refuses to complete a run with open tasks and writes nothing', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    await expectIncompleteAndRefused(undefined, 2);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('refuses to complete a run whose ticked task still has an open Sub-task', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = sectionsWithEveryTaskAndSubTaskTicked();
    subTaskAt(elementAt(contentsOfTheFirstTask(sections), 1), 1).isCompleted = false;

    await expectIncompleteAndRefused(sections, 1);
  });

  it('refuses to complete a run with no tasks', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({ items: JSON.stringify([{ id: 'section-1', title: 'Launch', items: [] }]) })]);

    await expectIncompleteAndRefused(undefined, 0);
  });

  it('completes a run when the same save ticks its last open task', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      items: JSON.stringify(sectionsWithEveryTaskAndSubTaskTicked().map((section) => ({
        ...section,
        items: section.items.map((item) => (item.id === 'item-2' ? { ...item, isCompleted: false } : item)),
      }))),
    })]);

    const { response } = await putShared({ sections: sectionsWithEveryTaskAndSubTaskTicked(), status: 'completed', expected_revision: 3 });

    expect(response.status).toBe(200);
    expect(storedUpdate()).toEqual(expect.objectContaining({ status: 'completed', progress: 100 }));
  });

  it('keeps saving notes on a run completed before the rule, open tasks and all', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({ status: 'completed', completed_at: '2026-02-01T00:00:00.000Z' })]);
    const sections = sectionsTheSharePageRendered();
    (taskIn(sections, 0, 1) as Record<string, unknown>).notes = 'Shipped anyway';

    const { response } = await putShared({ sections, status: 'completed', expected_revision: 3 });

    expect(response.status).toBe(200);
    expect(JSON.parse(storedUpdate().items as string)[0].items[1].notes).toBe('Shipped anyway');
  });

  it('leaves the completion stamps alone on later saves of a completed run', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      status: 'completed',
      completed_at: '2026-02-01T00:00:00.000Z',
      completed_by_user_id: 'owner-123',
    })]);

    const { response } = await putShared({ sections: sectionsTheSharePageRendered(), status: 'completed', expected_revision: 3 });

    expect(response.status).toBe(200);
    const update = storedUpdate();
    expect(update).not.toHaveProperty('completed_at');
    expect(update).not.toHaveProperty('completed_by_user_id');
  });

  it('requires expected_revision', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response } = await putShared({ sections: sectionsTheSharePageRendered() });

    expect(response.status).toBe(400);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('rejects oversized notes', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = sectionsTheSharePageRendered();
    (taskIn(sections, 0, 0) as Record<string, unknown>).notes = 'x'.repeat(5001);

    const { response } = await putShared({ sections, expected_revision: 3 });

    expect(response.status).toBe(400);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('saves guest notes and sub-item completion matched by id', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = sectionsTheSharePageRendered();
    (taskIn(sections, 0, 0) as Record<string, unknown>).notes = 'Guest note';
    const { subItems } = elementAt(contentsOfTheFirstTask(sections), 1);
    assert.exists(subItems);
    subItems.reverse();
    const sub2AfterTheReverse = firstOf(subItems);
    sub2AfterTheReverse.isCompleted = true;

    const { response } = await putShared({ sections, expected_revision: 3 });

    expect(response.status).toBe(200);
    const saved = JSON.parse(storedUpdate().items as string);
    expect(saved[0].items[0].notes).toBe('Guest note');
    expect(saved[0].items[0].contents[1].subItems).toEqual([
      expect.objectContaining({ id: 'sub-1', isCompleted: false }),
      expect.objectContaining({ id: 'sub-2', isCompleted: true }),
    ]);
    expect(storedUpdate().progress).toBe(25);
  });

  it('matches a legacy flat run without ids by the ids the share page assigns', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({
      items: JSON.stringify([{ title: 'First' }, { title: 'Second' }]),
    })]);

    const { response } = await putShared({
      sections: [{
        id: '1',
        title: 'Checklist',
        items: [
          { id: '1-1', title: 'First', isCompleted: false },
          { id: '1-2', title: 'Renamed', isCompleted: true },
        ],
      }],
      expected_revision: 3,
    });

    expect(response.status).toBe(200);
    const saved = JSON.parse(storedUpdate().items as string);
    expect(saved[0].items).toEqual([
      { title: 'First', isCompleted: false },
      { title: 'Second', isCompleted: true },
    ]);
  });

  it('records the merged state, not the raw payload, in the audit event', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    const sections = sectionsTheSharePageRendered();
    taskIn(sections, 0, 0).title = 'Log in here';

    await putShared({ sections, expected_revision: 3 });

    const audit = firstOf(dbMocks.insertChain.values.mock.calls)[0];
    expect(audit.action).toBe('checklist_run.shared_updated');
    expect(audit.diff_json).not.toContain('Log in here');
  });
});
