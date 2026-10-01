import { beforeEach, describe, expect, it } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, resetToASignedOutVisitorOnTheFreePlan, signInWithPlans, TEAM_PLAN } from '../../../support/apiHandlerMocks';

import { handleChecklists } from '@functions/api/handlers/checklists';
import { apiErrorBody, readJson } from '../../../support/readJson';

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
    resetToASignedOutVisitorOnTheFreePlan();
    signInWithPlans('user-123', TEAM_PLAN);
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
    expect(firstOf(dbMocks.insertChain.values.mock.calls)[0].team_id).toBe('team-b');
  });
});
