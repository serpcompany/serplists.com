import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { readJson } from '../../../support/readJson';

const progressBody = z.object({ progress: z.number() }).passthrough();

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('explicitly revalidates a completed run against the current template', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'user-123',
          team_id: null,
          template_id: 'template-1',
          title: 'Completed run',
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Old',
              items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Preserve' }],
            },
          ]),
          retired_items: '[]',
          status: 'completed',
          template_version: 1,
          revision: 2,
          is_public: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          version: 3,
          owner_type: 'user',
          team_id: null,
          user_id: 'user-123',
          is_public: false,
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Current',
              items: [
                { id: 'item-1', title: 'Renamed' },
                { id: 'item-2', title: 'New requirement' },
              ],
            },
          ]),
        },
      ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      success: true,
      progress: 50,
      revision: 3,
      template_version: 3,
    }));
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(update).toEqual(expect.objectContaining({
      status: 'in_progress',
      completed_at: null,
      template_version: 3,
    }));
    expect(JSON.parse(update.items)[0].items).toEqual([
      expect.objectContaining({ id: 'item-1', title: 'Renamed', isCompleted: true, notes: 'Preserve' }),
      expect.objectContaining({ id: 'item-2', isCompleted: false }),
    ]);
  });

  it('revalidates a run whose task the template moved to another section without resetting it', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{
        id: 'run-1', user_id: 'user-123', team_id: null, template_id: 'template-1', title: 'Completed run',
        items: JSON.stringify([
          { id: 'A', title: 'Plan', items: [{ id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' }] },
          { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish', isCompleted: true }] },
        ]),
        retired_items: '[]', status: 'in_progress', template_version: 1, revision: 2, is_public: false,
        started_at: new Date().toISOString(), created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{
        id: 'template-1', version: 2, owner_type: 'user', team_id: null, user_id: 'user-123', is_public: false,
        items: JSON.stringify([
          { id: 'A', title: 'Plan', items: [] },
          { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish' }, { id: 'x', title: 'Call vendor' }] },
        ]),
      }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ progress: 100 }));
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(JSON.parse(update.items)[1].items[1]).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(JSON.parse(update.retired_items)).toEqual([]);
  });

  it('names the work a revalidate retired in its Changelog event', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        items: JSON.stringify([{ id: 'section-1', title: 'Launch', items: [
          { id: 'item-dns', title: 'Check DNS', isCompleted: true, notes: 'Registrar login is in vault X' },
          { id: 'item-copy', title: 'Write copy' },
        ] }]),
        retired_items: '[]',
        status: 'in_progress',
        template_version: 1,
        revision: 2,
      }])
      .mockResolvedValueOnce([{
        id: 'template-1',
        version: 2,
        owner_type: 'user',
        team_id: null,
        user_id: 'user-123',
        is_public: false,
        items: JSON.stringify([{ id: 'section-1', title: 'Launch', items: [{ id: 'item-copy', title: 'Write copy' }] }]),
      }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const auditEvent = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values.action === 'checklist_run.revalidated');
    expect(JSON.parse(auditEvent.metadata_json)).toEqual({
      templateId: 'template-1',
      templateVersion: 2,
      retired: [{ kind: 'item', id: 'item-dns', title: 'Check DNS' }],
    });
    expect(JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].retired_items)).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ id: 'item-dns', notes: 'Registrar login is in vault X' }) }),
    ]);
  });

  it('revalidates a completed run so a task with a new Sub-task is no longer complete', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'user-123',
          team_id: null,
          template_id: 'template-1',
          title: 'Completed run',
          items: JSON.stringify([
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
          retired_items: '[]',
          status: 'completed',
          template_version: 1,
          revision: 2,
          is_public: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          version: 3,
          owner_type: 'user',
          team_id: null,
          user_id: 'user-123',
          is_public: false,
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Launch',
              items: [{
                id: 'item-1',
                title: 'Write copy',
                contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }, { id: 'sub-2', title: 'Tagline' }] }],
              }],
            },
          ]),
        },
      ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);
    const data = await readJson(response, progressBody);

    expect(response.status).toBe(200);
    expect(data.progress).toBeLessThan(100);
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(update.status).toBe('in_progress');
    expect(JSON.parse(update.items)[0].items[0]).toEqual(expect.objectContaining({ id: 'item-1', isCompleted: false }));
  });
});
