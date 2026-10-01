import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks, successBody } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { jsonObjects, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should hide archived checklist runs from normal detail reads', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'in_progress',
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
  });

  it('should archive checklist runs with deleted_at instead of hard deleting', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        is_public: true,
        share_token: 'share-token',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1', { method: 'DELETE' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.db.delete).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        is_public: false,
        share_token: null,
      }),
    );
  });

  it('should list archived checklist runs for the active personal workspace', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'completed',
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/checklists/archived', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        title: 'Archived Run',
        deleted_at: '2026-07-03T12:00:00.000Z',
      }),
    );
  });

  it('should restore archived checklist runs privately and audit the restore', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        share_token: null,
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1/restore', { method: 'POST' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: null,
        is_public: false,
        share_token: null,
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.restored',
        resource_type: 'checklist_run',
        resource_id: 'run-1',
      }),
    );
  });
});
