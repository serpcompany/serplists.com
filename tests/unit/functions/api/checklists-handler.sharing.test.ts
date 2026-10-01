import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks, runBody, successBody } from '../../../support/checklistsHandler';
import { schema } from '@functions/api/db';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should create share links for personal checklist run owners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Personal Run',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('run-1');
    expect(data.sharePath).toMatch(/^\/share\//);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_token: expect.any(String),
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        resource_type: 'checklist_run',
        resource_id: 'run-1',
      }),
    );
  });

  it('should create share links for team checklist runs when the user can run team templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'creator-1',
          team_id: 'team-1',
          title: 'Team Run',
          items: '[]',
          status: 'in_progress',
          is_public: false,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('run-1');
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_token: expect.any(String),
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        subject_type: 'team',
        subject_id: 'team-1',
        resource_id: 'run-1',
      }),
    );
  });

  it('should reject team checklist share links for viewers', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'creator-1',
          team_id: 'team-1',
          title: 'Team Run',
          items: '[]',
          status: 'in_progress',
          is_public: false,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(403);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('should serve shared checklist runs without authentication', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        template_id: 'template-2',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        user_id: 'owner-123',
        share_token: 'shared-run',
        is_public: true,
        revision: 3,
        template_version: 1,
        current_template_version: 2,
      },
    ]);

    const request = new Request('http://localhost/api/checklists/shared/shared-run', {
      method: 'GET',
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('shared-run');
    expect(data.title).toBe('Shared Run');
    expect(data.is_stale).toBe(true);
    expect(data.template_version).toBe(1);
    expect(data.current_template_version).toBe(2);
  });

  it('leaves retired work out of shared runs: its notes were written while the run was private', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[]',
        retired_items: JSON.stringify([
          { kind: 'item', sectionId: 's1', item: { id: 'item-dns', title: 'Check DNS', notes: 'Registrar login is in vault X' } },
        ]),
        share_token: 'shared-run',
        is_public: true,
      },
    ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run'), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).not.toHaveProperty('retired_items');
    expect(JSON.stringify(data)).not.toContain('vault X');
  });

  it('gives share-link guests exactly the run fields the share page needs, so a column added later stays private', async () => {
    const sharedRunKeys = [
      'completed_at', 'current_template_version', 'id', 'is_public', 'is_stale', 'items', 'progress',
      'revision', 'started_at', 'status', 'template_version', 'title',
    ];
    const everyColumn = Object.fromEntries(
      Object.keys(getTableColumns(schema.checklist_runs)).map((column) => [column, `value-${column}`]),
    );
    const privateValues = {
      user_id: 'owner-secret-id',
      team_id: 'org-secret-id',
      template_id: 'template-secret-id',
      created_by_user_id: 'creator-secret-id',
      assigned_to_user_id: 'assignee-secret-id',
      started_by_user_id: 'starter-secret-id',
      completed_by_user_id: 'completer-secret-id',
      retired_items: JSON.stringify([{ id: 'retired-1', title: 'Old task', notes: 'retired-secret-note' }]),
    };
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      ...everyColumn,
      ...privateValues,
      title: 'Shared Run',
      items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
      status: 'in_progress',
      progress: 0,
      is_public: true,
      completed_at: null,
      revision: 4,
      template_version: 1,
      current_template_version: 2,
    }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run'), mockEnv);
    const text = await response.text();
    const data = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(sharedRunKeys);
    for (const value of Object.values(privateValues)) expect(text).not.toContain(value);
    expect(text).not.toContain('retired-secret-note');
    expect(data).toMatchObject({ revision: 4, template_version: 1, current_template_version: 2, is_stale: true, is_public: true });
    const columnsReadFromD1 = Object.keys((dbMocks.db.select.mock.calls[0] as unknown[])[0] as object);
    expect(columnsReadFromD1.sort()).toEqual(sharedRunKeys.filter((key) => key !== 'is_stale' && key !== 'is_public'));
  });

  it('should update completion on shared checklist runs without changing their tasks', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        template_id: 'template-2',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        user_id: 'owner-123',
        team_id: null,
        share_token: 'shared-run',
        is_public: true,
        revision: 3,
      },
    ]);

    const request = new Request('http://localhost/api/checklists/shared/shared-run', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: '1', title: 'Renamed', items: [{ id: 'item-1', title: 'Renamed item', isCompleted: true }] }],
        status: 'completed',
        expected_revision: 3,
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revision).toBe(4);
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(JSON.parse(update.items)).toEqual([
      { id: '1', title: 'Checklist', items: [{ id: 'item-1', title: 'Item 1', isCompleted: true }] },
    ]);
    expect(update).toEqual(expect.objectContaining({ status: 'completed', progress: 100 }));
    const batchStatements = dbMocks.db.batch.mock.calls[0][0];
    expect(batchStatements).toHaveLength(2);
    const [, runUpdateAfterTheGuardedAudit] = batchStatements;
    expect(runUpdateAfterTheGuardedAudit).toBe(dbMocks.updateChain);
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.shared_updated',
        actor_user_id: null,
        resource_type: 'checklist_run',
        resource_id: 'shared-run',
      }),
    );
  });

  it('should reject shared checklist updates when the share token is not active', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/checklists/shared/missing-run', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: '1', title: 'Checklist', items: [] }],
        expected_revision: 1,
      }),
    });

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('answers an unknown share token before reading the request body', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);
    let bodyPulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyPulled = true;
          controller.enqueue(new TextEncoder().encode('{"sections":['));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    const request = new Request('http://localhost/api/checklists/shared/missing-run', {
      method: 'PUT',
      body,
      duplex: 'half',
    } as RequestInit);

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(request.bodyUsed).toBe(false);
    expect(bodyPulled).toBe(false);
  });
});
