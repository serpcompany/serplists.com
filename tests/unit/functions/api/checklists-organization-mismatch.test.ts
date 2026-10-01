import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import { handleChecklists } from '@functions/api/handlers/checklists';
import {
  type Entitlements,
  getEntitlementsForContext,
  getEntitlementsForUser,
} from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from '../../../support/apiEnv';
import { apiErrorBody, readJson } from '../../../support/readJson';

const mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

const privateTeamBTemplate = {
  id: 'template-b',
  user_id: 'creator-1',
  owner_type: 'team',
  team_id: 'team-b',
  title: 'Team B Template',
  items: '[{"id":"section-1","title":"Checklist","items":[{"id":"item-1","title":"Item"}]}]',
  is_public: false,
};

const routesThatStartARunFromATemplate = [
  ['POST /api/checklists', 'http://localhost/api/checklists', { template_id: 'template-b', teamId: 'team-a' }],
] as const;

const post = (url: string, body: unknown) =>
  handleChecklists(new Request(url, { method: 'POST', body: JSON.stringify(body) }), mockEnv);

describe('runs from a private template of another Organization, whose content never lands in the requested one', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([]);

    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const team: Entitlements = { plan: 'team', limits: { maxTemplates: null, maxActiveRuns: null } };
    vi.mocked(getEntitlementsForUser).mockResolvedValue(team);
    vi.mocked(getEntitlementsForContext).mockResolvedValue(team);
  });

  it.each(routesThatStartARunFromATemplate)('%s tells a member of the owning Organization where the template belongs', async (_name, url, body) => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([privateTeamBTemplate])
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-b', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const response = await post(url, body);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('organization_mismatch');
    expect(data.details).toEqual({ teamId: 'team-b' });
    expect(data.error).not.toMatch(/not found/i);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it.each(routesThatStartARunFromATemplate)('%s still answers 404 to someone outside the owning Organization', async (_name, url, body) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([privateTeamBTemplate]).mockResolvedValueOnce([]);

    const response = await post(url, body);

    expect(response.status).toBe(404);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('creates the Run in the owning Organization when the client asks for it', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([privateTeamBTemplate])
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-b', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const response = await post('http://localhost/api/checklists', { template_id: 'template-b', teamId: 'team-b' });

    expect(response.status).toBe(200);
    expect(dbMocks.insertChain.values.mock.calls[0][0].team_id).toBe('team-b');
  });
});
