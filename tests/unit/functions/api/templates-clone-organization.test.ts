import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, FREE_PLAN, mockEnv, resetToASignedOutVisitorOnTheFreePlan, signInWithPlans } from '../../../support/apiHandlerMocks';
import { activeMember, publicTemplateSource } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';

const membership = (role: string) => [activeMember(role)];

const publicSource = [publicTemplateSource()];

const cloneIntoOrganization = () =>
  handleTemplates(apiRequest('templates/template-1/clone', 'POST', { teamId: 'team-1', visibility: 'private' }), mockEnv);

describe('POST /api/templates/:id/clone into an Organization, which decides for the template detail page whether a Free Organization may take the copy', () => {
  beforeEach(() => {
    resetToASignedOutVisitorOnTheFreePlan();
    signInWithPlans('user-123', FREE_PLAN);
  });

  it('copies into a Free Organization that is under its Template limit', async () => {
    const organizationTemplatesCounted = [{ count: 0 }];
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(membership('editor'))
      .mockResolvedValueOnce(organizationTemplatesCounted)
      .mockResolvedValueOnce(publicSource);

    const response = await cloneIntoOrganization();

    expect(response.status).toBe(200);
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'team', teamId: 'team-1' }),
    );
  });

  it('reports limit_reached once the Free Organization is at its limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(membership('editor'))
      .mockResolvedValueOnce([{ count: 1 }]);

    const response = await cloneIntoOrganization();
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });

  it('refuses a role that cannot add Templates to the Organization', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce(membership('viewer'));

    const response = await cloneIntoOrganization();
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBeUndefined();
  });
});
