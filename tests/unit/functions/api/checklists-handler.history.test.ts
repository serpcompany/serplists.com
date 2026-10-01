import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { activeMember, organizationRunRow, personalRunRow, startedJustNow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { readJson } from '../../../support/readJson';
import { objectContaining } from '../../../support/asymmetricMatchers';

const runHistoryBody = z.object({ events: z.array(z.record(z.unknown())) }).passthrough();

const readHistory = (query = '') => handleChecklists(apiRequest(`checklists/run-1/history${query}`), mockEnv);

describe('Checklists Handlers', () => {
  beforeEach(() => {
    resetChecklistsHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('should return checklist run history for active team members, without the diffs that hold whole runs', async () => {
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([organizationRunRow(startedJustNow())])
      .mockResolvedValueOnce([activeMember('viewer')])
      .mockResolvedValueOnce([
        {
          id: 'audit-1',
          actor_user_id: 'user-123',
          subject_type: 'team',
          subject_id: 'team-1',
          resource_type: 'checklist_run',
          resource_id: 'run-1',
          action: 'checklist_run.updated',
          diff_json: '{"status":"completed"}',
          metadata_json: '{"source":"test"}',
          request_id: 'req-1',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_email: 'runner@example.com',
          actor_name: 'Runner Example',
          actor_username: 'runner',
        },
      ]);

    const response = await readHistory();
    const data = await readJson(response, runHistoryBody);

    expect(response.status).toBe(200);
    expect(data.subject).toEqual({ type: 'team', id: 'team-1' });
    expect(data.events[0]).toEqual(
      objectContaining({
        action: 'checklist_run.updated',
        actor: objectContaining({ name: 'Runner Example' }),
        metadata: { source: 'test' },
      }),
    );
    expect(data.events[0]).not.toHaveProperty('diff');
  });

  it.each([
    ['?limit=8', 8],
    ['', 50],
    ['?limit=0', 1],
    ['?limit=1000', 100],
    ['?limit=abc', 50],
  ])('reads at most the requested number of run history events, 50 by default and 1 to 100 (%s)', async (query, expected) => {
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([personalRunRow({ title: 'My Run', ...startedJustNow() })])
      .mockResolvedValueOnce([]);

    const response = await readHistory(query);

    expect(response.status).toBe(200);
    expect(dbMocks.selectChain.limit).toHaveBeenLastCalledWith(expected);
  });

  it('should not expose personal checklist run history to other users', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalRunRow({ user_id: 'other-user', title: 'Other Run', ...startedJustNow() }),
    ]);

    const response = await readHistory();

    expect(response.status).toBe(404);
  });
});
