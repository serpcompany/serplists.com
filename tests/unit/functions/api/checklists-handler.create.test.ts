import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  dbMocks,
  expectTheOrganizationPlanChecked,
  mockEnv,
  resetChecklistsHandlerMocks,
  runBody,
  TEAM_PLAN,
} from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { calculateSectionsProgress, normalizeSections } from '@/lib/utils/checklistSections';
import {
  RUN_SECTIONS_WITH_LEGACY_IDS,
  TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS,
  TEMPLATE_SECTIONS_CARRYING_RUN_STATE,
  UNTICKED_RUN_SECTIONS,
} from '../../../fixtures/runStartFixtures';
import { activeMember, organizationTemplateRow, personalTemplateRow } from '../../../fixtures/handlerRows';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

const RUN_OF_LEGACY_ITEMS = { title: 'Run', items: [{ id: 'item-1', title: 'Item 1' }] };

const post = (body: Record<string, unknown>, path = 'checklists') => handleChecklists(apiRequest(path, 'POST', body), mockEnv);

async function insertedRunOf(response: Response) {
  const data = await readJson(response, runBody);

  expect(response.status).toBe(200);
  expect(data.id).toBeDefined();
  return dbMocks.insertChain.values.mock.calls[0][0];
}

async function insertedOrganizationRunOf(response: Response) {
  const inserted = await insertedRunOf(response);
  expectTheOrganizationPlanChecked();
  expect(inserted.team_id).toBe('team-1');
  return inserted;
}

function signInAsAnOrganizationRunner() {
  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  vi.mocked(getEntitlementsForContext).mockResolvedValue(TEAM_PLAN);
}

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should reject unauthenticated access', async () => {
    const response = await handleChecklists(apiRequest('checklists'), mockEnv);
    expect(response.status).toBe(401);
  });

  it('should create checklist runs from legacy items', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const inserted = await insertedRunOf(await post(RUN_OF_LEGACY_ITEMS));

    const storedItems = JSON.parse(inserted.items);
    expect(storedItems[0].items).toHaveLength(1);
  });

  it('should create checklist runs from the server-side template snapshot', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        personalTemplateRow({
          title: 'Server Template',
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Stored section',
              items: [
                {
                  id: 'item-1',
                  title: 'Stored item',
                  isCompleted: true,
                  subItems: [{ id: 'sub-1', title: 'Stored sub-item', isCompleted: true }],
                },
              ],
            },
          ]),
          is_public: false,
          version: 7,
        }),
      ])
      .mockResolvedValueOnce([{ count: 0 }]);

    const inserted = await insertedRunOf(await post({
      template_id: 'template-1',
      title: 'Client Run Name',
      sections: [{ id: 'tampered', title: 'Tampered', items: [] }],
    }));

    const storedItems = JSON.parse(inserted.items);
    expect(inserted.title).toBe('Client Run Name');
    expect(storedItems[0].id).toBe('section-1');
    expect(storedItems[0].title).toBe('Stored section');
    expect(storedItems[0].items[0].title).toBe('Stored item');
    expect(storedItems[0].items[0].isCompleted).toBe(false);
    expect(storedItems[0].items[0].subItems[0].isCompleted).toBe(false);
    expect(inserted.template_version).toBe(7);
    expect(inserted.revision).toBe(1);
  });

  it.each([
    ['', TEMPLATE_SECTIONS_CARRYING_RUN_STATE, UNTICKED_RUN_SECTIONS],
    [' and the ids its next save stores', TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS, RUN_SECTIONS_WITH_LEGACY_IDS],
  ])('starts web runs from a template with every task and Sub-task unticked%s, as MCP start_run does', async (_ids, templateSections, runSections) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        personalTemplateRow({ title: 'Server Template', items: JSON.stringify(templateSections), is_public: false, version: 2 }),
      ])
      .mockResolvedValueOnce([{ count: 0 }]);

    const response = await post({ template_id: 'template-1' });

    expect(response.status).toBe(200);
    const storedItems = JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items);
    expect(storedItems).toEqual(runSections);
    const progressTheRunPageShows = calculateSectionsProgress(normalizeSections(storedItems));
    expect(progressTheRunPageShows).toBe(0);
  });

  it('should reject checklist runs from inaccessible private templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalTemplateRow({ user_id: 'other-user', title: 'Private Template', items: '[]', is_public: false }),
    ]);

    const response = await post({ template_id: 'template-1', title: 'Run' });

    expect(response.status).toBe(404);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('should create team runs from private team templates in the template workspace', async () => {
    signInAsAnOrganizationRunner();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        organizationTemplateRow({
          title: 'Team Template',
          items: '[{"id":"section-1","title":"Stored team section","items":[]}]',
          is_public: false,
        }),
      ])
      .mockResolvedValueOnce([activeMember('runner')]);

    const inserted = await insertedOrganizationRunOf(await post({ template_id: 'template-1' }));

    expect(inserted.title).toBe('Team Template');
  });

  it('should create team-owned checklist runs for team runners', async () => {
    signInAsAnOrganizationRunner();
    dbMocks.selectChain.limit.mockResolvedValueOnce([activeMember('runner')]);

    const inserted = await insertedOrganizationRunOf(await post({
      teamId: 'team-1',
      title: 'Team Run',
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
    }));

    expect(inserted.created_by_user_id).toBe('user-123');
    expect(inserted.started_by_user_id).toBe('user-123');
  });

  it('should enforce free plan active run limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 3 }]);

    const response = await post(RUN_OF_LEGACY_ITEMS);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });

  it.each([
    ['a Personal run', { runName: 'Shared Run' }],
    ['an Organization run', { teamId: 'team-1' }],
  ])('no longer creates %s from a template share link, whose runs escaped the active-run count', async (_label, body) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValue([
      { id: 'template-2', title: 'Template 2', items: '[]', is_public: 1, user_id: 'user-123', count: 0, role: 'owner', status: 'active' },
    ]);

    const response = await post(body, 'checklists/template-2/share');

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('does not create a run from an unknown POST path', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const response = await post({ title: 'Run', sections: [] }, 'checklists/anything/else');

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });
});
