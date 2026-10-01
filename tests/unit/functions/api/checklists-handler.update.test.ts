import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks, successBody } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { activeMember, organizationRunRow, personalRunRow, startedJustNow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

const putRun = (body: Record<string, unknown>) => handleChecklists(apiRequest('checklists/run-1', 'PUT', body), mockEnv);

async function expectEditConflict(response: Response) {
  const data = await readJson(response, apiErrorBody);

  expect(response.status).toBe(409);
  expect(data.code).toBe('edit_conflict');
}

describe('Checklists Handlers', () => {
  beforeEach(() => {
    resetChecklistsHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('should reject empty update payloads', async () => {
    const response = await putRun({});
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/No fields to update/i);
  });

  it('never lets a client write retired work: only reconciliation and Revalidate do', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRunRow({ revision: 1 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

    const response = await putRun({ title: 'Renamed', retired_items: '[]', retiredItems: [] });

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalled();
    for (const [values] of dbMocks.updateChain.set.mock.calls) {
      expect(values).not.toHaveProperty('retired_items');
      expect(values).not.toHaveProperty('retiredItems');
    }
  });

  it('should update team-owned checklist runs for team runners', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([organizationRunRow(startedJustNow())])
      .mockResolvedValueOnce([activeMember('runner')])
      .mockResolvedValueOnce([activeMember('runner')]);

    const response = await putRun({ status: 'completed' });
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
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRunRow({ revision: 5, ...startedJustNow() })]);

    await expectEditConflict(await putRun({
      sections: [{ id: 'section-1', title: 'Stale', items: [] }],
      expected_revision: 4,
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('reports a conflict when a run changes between the read and conditional write', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRunRow({ revision: 5, ...startedJustNow() })]);
    const guardedAuditInsertAndUpdateBothMiss = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(guardedAuditInsertAndUpdateBothMiss);

    await expectEditConflict(await putRun({ title: 'Concurrent edit', expected_revision: 5 }));
  });
});
