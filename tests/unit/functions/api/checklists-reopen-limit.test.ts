import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, FREE_PLAN, mockEnv, PRO_PLAN, resetToASignedInUser } from '../../../support/checklistsHandler';
import { apiRequest } from '../../../support/apiRequest';
import { z } from 'zod';
import { readJson } from '../../../support/readJson';

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const reopenBody = z.object({ code: z.unknown(), details: z.unknown() }).passthrough();

const membership = { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' };
const sections = [{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: false }] }];

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Run',
    items: JSON.stringify(sections),
    retired_items: '[]',
    status: 'completed',
    completed_at: '2026-09-01T00:00:00.000Z',
    template_version: 1,
    revision: 2,
    is_public: false,
    share_token: null,
    ...overrides,
  };
}

const ownTemplate = {
  id: 'template-1',
  version: 2,
  items: JSON.stringify(sections),
  owner_type: 'user',
  team_id: null,
  user_id: 'user-123',
  is_public: false,
};

async function send(path: string, method: string, body: unknown) {
  const response = await handleChecklists(apiRequest(`checklists/${path}`, method, body), mockEnv);
  return { response, data: await readJson(response, reopenBody) };
}

function expectLimitReached(
  result: { response: Response; data: { code?: unknown; details?: unknown } },
  context: 'personal' | 'organization' = 'personal',
) {
  expect(result.response.status).toBe(403);
  expect(result.data.code).toBe('limit_reached');
  expect(result.data.details).toEqual({ limit: 3, current: 3, resource: 'active_runs', context });
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

describe('reopening a run respects the active-run limit, since it adds an active run', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', FREE_PLAN);
  });

  it('refuses to revalidate a completed run at the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([ownTemplate])
      .mockResolvedValueOnce([{ count: 3 }]);

    expectLimitReached(await send('run-1/revalidate', 'POST', { expected_revision: 2 }));
  });

  it('revalidates a completed run below the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([ownTemplate])
      .mockResolvedValueOnce([{ count: 2 }]);

    const { response } = await send('run-1/revalidate', 'POST', { expected_revision: 2 });

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('revalidates an in-progress run without checking the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ status: 'in_progress', completed_at: null })])
      .mockResolvedValueOnce([ownTemplate]);

    const { response } = await send('run-1/revalidate', 'POST', { expected_revision: 2 });

    expect(response.status).toBe(200);
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('refuses PUT status in_progress on a completed run at the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([{ count: 3 }]);

    expectLimitReached(await send('run-1', 'PUT', { status: 'in_progress', expected_revision: 2 }));
  });

  it('keeps saving an in-progress run at (or over) the limit without checking it', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([run({ status: 'in_progress', completed_at: null })]);

    const { response } = await send('run-1', 'PUT', { status: 'in_progress', sections, expected_revision: 2 });

    expect(response.status).toBe(200);
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('lets a Pro user reopen a completed run', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(PRO_PLAN);
    dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

    const { response } = await send('run-1', 'PUT', { status: 'in_progress', expected_revision: 2 });

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('counts an Organization run against its Organization', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ team_id: 'team-1', user_id: 'other-member' })])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([{ count: 3 }]);

    expectLimitReached(await send('run-1', 'PUT', { status: 'in_progress', expected_revision: 2 }), 'organization');
    expect(getEntitlementsForContext).toHaveBeenCalledWith(mockEnv, expect.objectContaining({ type: 'team', teamId: 'team-1' }));
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('refuses a share-link reopen at the owner\'s limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ user_id: 'owner-1', is_public: true, share_token: 'token-1' })])
      .mockResolvedValueOnce([{ count: 3 }]);

    expectLimitReached(await send('shared/token-1', 'PUT', { status: 'in_progress', expected_revision: 2 }));
    expect(getEntitlementsForUser).toHaveBeenCalledWith(mockEnv, 'owner-1');
  });

  it('lets a share-link guest keep saving an in-progress run without checking the limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      run({ user_id: 'owner-1', is_public: true, share_token: 'token-1', status: 'in_progress', completed_at: null }),
    ]);

    const { response } = await send('shared/token-1', 'PUT', { status: 'in_progress', sections, expected_revision: 2 });

    expect(response.status).toBe(200);
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });
});
