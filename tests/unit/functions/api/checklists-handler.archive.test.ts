import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dbMocks,
  expectSuccessUpdating,
  mockEnv,
  PRO_PLAN,
  resetChecklistsHandlerMocks,
} from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { ARCHIVED_AT, personalRunRow, startedJustNow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { jsonObjects, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(() => {
    resetChecklistsHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('should hide archived checklist runs from normal detail reads', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalRunRow({ title: 'Archived Run', deleted_at: ARCHIVED_AT, ...startedJustNow() }),
    ]);

    const response = await handleChecklists(apiRequest('checklists/run-1'), mockEnv);

    expect(response.status).toBe(404);
  });

  it('should archive checklist runs with deleted_at instead of hard deleting', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalRunRow({ is_public: true, share_token: 'share-token', ...startedJustNow() }),
    ]);

    const response = await handleChecklists(apiRequest('checklists/run-1', 'DELETE'), mockEnv);

    expect(dbMocks.db.delete).not.toHaveBeenCalled();
    await expectSuccessUpdating(response, { deleted_at: expect.any(String), is_public: false, share_token: null });
  });

  it('should list archived checklist runs for the active personal workspace', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      personalRunRow({
        title: 'Archived Run',
        status: 'completed',
        deleted_at: ARCHIVED_AT,
        ...startedJustNow(),
        updated_at: ARCHIVED_AT,
      }),
    ]);

    const response = await handleChecklists(apiRequest('checklists/archived'), mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        title: 'Archived Run',
        deleted_at: ARCHIVED_AT,
      }),
    );
  });

  it('should restore archived checklist runs privately and audit the restore', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(PRO_PLAN);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalRunRow({
        title: 'Archived Run',
        is_public: false,
        share_token: null,
        deleted_at: ARCHIVED_AT,
        ...startedJustNow(),
        updated_at: ARCHIVED_AT,
      }),
    ]);

    const response = await handleChecklists(apiRequest('checklists/run-1/restore', 'POST'), mockEnv);

    await expectSuccessUpdating(response, { deleted_at: null, is_public: false, share_token: null });
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.restored',
        resource_type: 'checklist_run',
        resource_id: 'run-1',
      }),
    );
  });
});
