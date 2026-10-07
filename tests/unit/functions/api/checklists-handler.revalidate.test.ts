import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstOf, present, taskIn } from '../../../support/elements';
import { z } from 'zod';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { personalTemplateRow, startedJustNow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { readJson } from '../../../support/readJson';
import { objectContaining } from '../../../support/asymmetricMatchers';
import { jsonRecordIn, jsonRecordsIn, storedSectionsIn } from '../../../support/storedJson';

const progressBody = z.object({ progress: z.number() }).passthrough();

const revalidate = () => handleChecklists(apiRequest('checklists/run-1/revalidate', 'POST', { expected_revision: 2 }), mockEnv);

function runAtRevision2(sections: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    items: JSON.stringify(sections),
    retired_items: '[]',
    status: 'in_progress',
    template_version: 1,
    revision: 2,
    ...overrides,
  };
}

function completedRun(sections: unknown[]) {
  return runAtRevision2(sections, {
    title: 'Completed run',
    status: 'completed',
    is_public: false,
    ...startedJustNow(),
    completed_at: new Date().toISOString(),
  });
}

function theRunAndItsTemplate(run: Record<string, unknown>, templateVersion: number, templateSections: unknown[]) {
  dbMocks.selectChain.limit
    .mockResolvedValueOnce([run])
    .mockResolvedValueOnce([personalTemplateRow({ version: templateVersion, is_public: false, items: JSON.stringify(templateSections) })]);
}

const savedUpdate = () => firstOf(dbMocks.updateChain.set.mock.calls)[0];

describe('Checklists Handlers', () => {
  beforeEach(() => {
    resetChecklistsHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('explicitly revalidates a completed run against the current template', async () => {
    theRunAndItsTemplate(
      completedRun([
        {
          id: 'section-1',
          title: 'Old',
          items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Preserve' }],
        },
      ]),
      3,
      [
        {
          id: 'section-1',
          title: 'Current',
          items: [
            { id: 'item-1', title: 'Renamed' },
            { id: 'item-2', title: 'New requirement' },
          ],
        },
      ],
    );

    const response = await revalidate();
    const data: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      success: true,
      progress: 50,
      revision: 3,
      template_version: 3,
    }));
    const update = savedUpdate();
    expect(update).toEqual(expect.objectContaining({
      status: 'in_progress',
      completed_at: null,
      template_version: 3,
    }));
    expect(firstOf(storedSectionsIn(update.items)).items).toEqual([
      expect.objectContaining({ id: 'item-1', title: 'Renamed', isCompleted: true, notes: 'Preserve' }),
      expect.objectContaining({ id: 'item-2', isCompleted: false }),
    ]);
  });

  it('revalidates a run whose task the template moved to another section without resetting it', async () => {
    theRunAndItsTemplate(
      runAtRevision2([
        { id: 'A', title: 'Plan', items: [{ id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' }] },
        { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish', isCompleted: true }] },
      ], { title: 'Completed run', is_public: false, ...startedJustNow() }),
      2,
      [
        { id: 'A', title: 'Plan', items: [] },
        { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish' }, { id: 'x', title: 'Call vendor' }] },
      ],
    );

    const response = await revalidate();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ progress: 100 }));
    const update = savedUpdate();
    expect(taskIn(storedSectionsIn(update.items), 1, 1)).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(jsonRecordsIn(update.retired_items)).toEqual([]);
  });

  it('names the work a revalidate retired in its Changelog event', async () => {
    theRunAndItsTemplate(
      runAtRevision2([{ id: 'section-1', title: 'Launch', items: [
        { id: 'item-dns', title: 'Check DNS', isCompleted: true, notes: 'Registrar login is in vault X' },
        { id: 'item-copy', title: 'Write copy' },
      ] }]),
      2,
      [{ id: 'section-1', title: 'Launch', items: [{ id: 'item-copy', title: 'Write copy' }] }],
    );

    const response = await revalidate();

    expect(response.status).toBe(200);
    const auditEvent = present(
      dbMocks.insertChain.values.mock.calls.map(([values]) => values).find((values) => values.action === 'checklist_run.revalidated'),
      'the checklist_run.revalidated event',
    );
    expect(jsonRecordIn(auditEvent.metadata_json)).toEqual({
      templateId: 'template-1',
      templateVersion: 2,
      retired: [{ kind: 'item', id: 'item-dns', title: 'Check DNS' }],
    });
    expect(jsonRecordsIn(savedUpdate().retired_items)).toEqual([
      objectContaining({ item: objectContaining({ id: 'item-dns', notes: 'Registrar login is in vault X' }) }),
    ]);
  });

  it('revalidates a completed run so a task with a new Sub-task is no longer complete', async () => {
    theRunAndItsTemplate(
      completedRun([
        {
          id: 'section-1',
          title: 'Launch',
          items: [{
            id: 'item-1',
            title: 'Write copy',
            isCompleted: true,
            contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short', isCompleted: true }] }],
          }],
        },
      ]),
      3,
      [
        {
          id: 'section-1',
          title: 'Launch',
          items: [{
            id: 'item-1',
            title: 'Write copy',
            contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }, { id: 'sub-2', title: 'Tagline' }] }],
          }],
        },
      ],
    );

    const response = await revalidate();
    const data = await readJson(response, progressBody);

    expect(response.status).toBe(200);
    expect(data.progress).toBeLessThan(100);
    const update = savedUpdate();
    expect(update.status).toBe('in_progress');
    expect(taskIn(storedSectionsIn(update.items), 0, 0)).toEqual(expect.objectContaining({ id: 'item-1', isCompleted: false }));
  });
});
