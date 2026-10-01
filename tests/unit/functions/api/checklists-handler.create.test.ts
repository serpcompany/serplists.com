import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks, runBody } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { calculateSectionsProgress, normalizeSections } from '@/lib/utils/checklistSections';
import {
  RUN_SECTIONS_WITH_LEGACY_IDS,
  TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS,
  TEMPLATE_SECTIONS_CARRYING_RUN_STATE,
  UNTICKED_RUN_SECTIONS,
} from '../../../fixtures/runStartFixtures';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  it('should reject unauthenticated access', async () => {
    const request = new Request('http://localhost/api/checklists', { method: 'GET' });

    const response = await handleChecklists(request, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should create checklist runs from legacy items', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Run',
        items: [{ id: 'item-1', title: 'Item 1' }],
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    const storedItems = JSON.parse(inserted.items);
    expect(storedItems[0].items).toHaveLength(1);
  });

  it('should create checklist runs from the server-side template snapshot', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          user_id: 'user-123',
          owner_type: 'user',
          team_id: null,
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
        },
      ])
      .mockResolvedValueOnce([{ count: 0 }]);

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        template_id: 'template-1',
        title: 'Client Run Name',
        sections: [{ id: 'tampered', title: 'Tampered', items: [] }],
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
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
      .mockResolvedValueOnce([{
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Server Template',
        items: JSON.stringify(templateSections),
        is_public: false,
        version: 2,
      }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ template_id: 'template-1' }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const storedItems = JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items);
    expect(storedItems).toEqual(runSections);
    const progressTheRunPageShows = calculateSectionsProgress(normalizeSections(storedItems));
    expect(progressTheRunPageShows).toBe(0);
  });

  it('should reject checklist runs from inaccessible private templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'other-user',
        owner_type: 'user',
        team_id: null,
        title: 'Private Template',
        items: '[]',
        is_public: false,
      },
    ]);

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        template_id: 'template-1',
        title: 'Run',
      }),
    });

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('should create team runs from private team templates in the template workspace', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'team',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          user_id: 'creator-1',
          owner_type: 'team',
          team_id: 'team-1',
          title: 'Team Template',
          items: '[{"id":"section-1","title":"Stored team section","items":[]}]',
          is_public: false,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        template_id: 'template-1',
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({ type: 'team', teamId: 'team-1', userId: 'user-123' }),
    );

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.team_id).toBe('team-1');
    expect(inserted.title).toBe('Team Template');
  });

  it('should create team-owned checklist runs for team runners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'team',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
    ]);

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        teamId: 'team-1',
        title: 'Team Run',
        sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({ type: 'team', teamId: 'team-1', userId: 'user-123' }),
    );

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.team_id).toBe('team-1');
    expect(inserted.created_by_user_id).toBe('user-123');
    expect(inserted.started_by_user_id).toBe('user-123');
  });

  it('should enforce free plan active run limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 3 }]);

    const request = new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Run',
        items: [{ id: 'item-1', title: 'Item 1' }],
      }),
    });

    const response = await handleChecklists(request, mockEnv);
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

    const response = await handleChecklists(new Request('http://localhost/api/checklists/template-2/share', {
      method: 'POST',
      body: JSON.stringify(body),
    }), mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('does not create a run from an unknown POST path', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const response = await handleChecklists(new Request('http://localhost/api/checklists/anything/else', {
      method: 'POST',
      body: JSON.stringify({ title: 'Run', sections: [] }),
    }), mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });
});
