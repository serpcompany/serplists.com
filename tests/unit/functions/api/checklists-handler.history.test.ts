import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { readJson } from '../../../support/readJson';

const runHistoryBody = z.object({ events: z.array(z.record(z.unknown())) }).passthrough();

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should return checklist run history for active team members, without the diffs that hold whole runs', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);
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
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' }])
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

    const request = new Request('http://localhost/api/checklists/run-1/history', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runHistoryBody);

    expect(response.status).toBe(200);
    expect(data.subject).toEqual({ type: 'team', id: 'team-1' });
    expect(data.events[0]).toEqual(
      expect.objectContaining({
        action: 'checklist_run.updated',
        actor: expect.objectContaining({ name: 'Runner Example' }),
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
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'user-123',
          team_id: null,
          title: 'My Run',
          items: '[]',
          status: 'in_progress',
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request(`http://localhost/api/checklists/run-1/history${query}`, { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.selectChain.limit).toHaveBeenLastCalledWith(expected);
  });

  it('should not expose personal checklist run history to other users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'other-user',
        team_id: null,
        title: 'Other Run',
        items: '[]',
        status: 'in_progress',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1/history', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
  });
});
