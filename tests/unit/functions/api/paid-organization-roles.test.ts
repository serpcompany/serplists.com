import { beforeEach, describe, expect, it } from 'vitest';
import {
  dbMocks,
  expectTheOrganizationPlanChecked,
  FREE_PLAN,
  mockEnv,
  resetToASignedInUser,
  TEAM_PLAN,
} from '../../../support/apiHandlerMocks';
import { activeMember, ONE_SECTION_WITH_ONE_ITEM, organizationTemplateRow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';

import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';

const startAnOrganizationRun = () =>
  handleChecklists(apiRequest('checklists', 'POST', { teamId: 'team-1', title: 'Launch', sections: ONE_SECTION_WITH_ONE_ITEM }), mockEnv);

const editTheOrganizationTemplate = () =>
  handleTemplates(apiRequest('templates/template-1', 'PUT', { title: 'Renamed playbook', expected_version: 1 }), mockEnv);

const theOrganizationTemplateReadBy = (role: string) =>
  dbMocks.selectChain.limit
    .mockResolvedValueOnce([organizationTemplateRow({ title: 'Playbook', items: '[]', is_public: false, version: 1 })])
    .mockResolvedValueOnce([activeMember(role)])
    .mockResolvedValueOnce([activeMember(role)]);

describe('roles in a paid Organization, whose plan allows every write the role may not make', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', FREE_PLAN, TEAM_PLAN);
  });

  it('lets a runner start a Run there, and refuses a viewer without writing anything', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('runner')]);
    expect((await startAnOrganizationRun()).status).toBe(200);
    expectTheOrganizationPlanChecked();
    dbMocks.db.batch.mockClear();

    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('viewer')]);
    expect((await startAnOrganizationRun()).status).toBe(403);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('lets an editor edit its Template, and refuses a viewer without writing anything', async () => {
    theOrganizationTemplateReadBy('editor');
    expect((await editTheOrganizationTemplate()).status).toBe(200);
    dbMocks.db.batch.mockClear();
    dbMocks.updateChain.set.mockClear();

    theOrganizationTemplateReadBy('viewer');
    expect((await editTheOrganizationTemplate()).status).toBe(403);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });
});
