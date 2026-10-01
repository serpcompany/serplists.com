import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks, successBody } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should reject empty update payloads', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({}),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/No fields to update/i);
  });

  it('never lets a client write retired work: only reconciliation and Revalidate do', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'run-1', user_id: 'user-123', team_id: null, title: 'Run', items: '[]', status: 'in_progress', revision: 1 },
    ]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Renamed', retired_items: '[]', retiredItems: [] }),
    }), mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalled();
    for (const [values] of dbMocks.updateChain.set.mock.calls) {
      expect(values).not.toHaveProperty('retired_items');
      expect(values).not.toHaveProperty('retiredItems');
    }
  });

  it('should update team-owned checklist runs for team runners', async () => {
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
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const request = new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ status: 'completed' }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_by_user_id: 'user-123',
      }),
    );
  });

  it('rejects stale private run writes before they can discard template evolution', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        revision: 5,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: 'section-1', title: 'Stale', items: [] }],
        expected_revision: 4,
      }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('reports a conflict when a run changes between the read and conditional write', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        revision: 5,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    const guardedAuditInsertAndUpdateBothMiss = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(guardedAuditInsertAndUpdateBothMiss);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Concurrent edit', expected_revision: 5 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
  });
});
