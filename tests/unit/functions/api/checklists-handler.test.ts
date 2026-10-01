import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { z } from 'zod';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, deleteChain, db };
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

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) =>
  (await import('../../../support/guardedInserts')).guardedInsertsThroughThePlainInsertMock(importOriginal));

import { schema } from '@functions/api/db';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { calculateSectionsProgress, normalizeSections } from '@/lib/utils/checklistSections';
import {
  RUN_SECTIONS_WITH_LEGACY_IDS,
  TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS,
  TEMPLATE_SECTIONS_CARRYING_RUN_STATE,
  UNTICKED_RUN_SECTIONS,
} from '../../../fixtures/runStartFixtures';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiErrorBody, jsonObjects, readJson } from '../../../support/readJson';

const runBody = z.object({ id: z.string() }).passthrough();
const successBody = z.object({ success: z.boolean() }).passthrough();
const progressBody = z.object({ progress: z.number() }).passthrough();
const runHistoryBody = z.object({ events: z.array(z.record(z.unknown())) }).passthrough();

describe('Checklists Handlers', () => {
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.deleteChain.where.mockResolvedValue(undefined);
    dbMocks.db.batch.mockResolvedValue([]);

    mockEnv = {
      DB: {},
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    };

    vi.mocked(getSessionUserId).mockResolvedValue(null);
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'free',
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'free',
      limits: { maxTemplates: 1, maxActiveRuns: 3 },
    });
  });

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

  describe('malformed checklist content', () => {
    const malformedSections = [{
      id: 's1',
      title: 'Launch',
      items: [{ id: 'i1', title: 'Task', contents: [{ type: 'subItems', value: '', subItems: 'x' }] }],
    }];
    const path = 'sections[0].items[0].contents[0].subItems: Expected array, received string';

    it('POST rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(new Request('http://localhost/api/checklists', {
        method: 'POST',
        body: JSON.stringify({ title: 'Run', sections: malformedSections }),
      }), mockEnv);

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    });

    it('PUT rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
        method: 'PUT',
        body: JSON.stringify({ sections: malformedSections, expected_revision: 1 }),
      }), mockEnv);

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('the shared-run PUT never stores it, taking the structure from the stored run since a guest changes only completion and notes', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue(null);
      const storedSections = [{
        id: 's1',
        title: 'Launch',
        items: [{ id: 'i1', title: 'Task', contents: [{ type: 'subItems', value: '', subItems: [] }] }],
      }];
      dbMocks.selectChain.limit.mockResolvedValueOnce([{
        id: 'shared-run',
        user_id: 'owner-123',
        team_id: null,
        status: 'in_progress',
        items: JSON.stringify(storedSections),
        share_token: 'token-1',
        is_public: true,
        revision: 1,
      }]);

      const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/token-1', {
        method: 'PUT',
        body: JSON.stringify({ sections: malformedSections, expected_revision: 1 }),
      }), mockEnv);

      expect(response.status).toBe(200);
      expect(JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].items)).toEqual(storedSections);
    });

    it('starts a run from a Template stored before the check with the content made safe', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{
          id: 'template-1',
          user_id: 'user-123',
          owner_type: 'user',
          team_id: null,
          title: 'Stored before the check',
          items: JSON.stringify([{
            id: 's1',
            title: 'Launch',
            items: [{ id: 'i1', title: 'Task', contents: [
              { type: 'subItems', value: '', subItems: 'x' },
              { type: 'text', value: {} },
            ] }],
          }]),
          is_public: false,
          version: 2,
        }])
        .mockResolvedValueOnce([{ count: 0 }]);

      const response = await handleChecklists(new Request('http://localhost/api/checklists', {
        method: 'POST',
        body: JSON.stringify({ template_id: 'template-1', title: 'Run' }),
      }), mockEnv);

      expect(response.status).toBe(200);
      const stored = JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items);
      expect(stored[0].items[0].contents).toEqual([
        { type: 'subItems', value: '', subItems: [] },
        { type: 'text', value: '' },
      ]);
    });
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

  it('should reject empty update payloads', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({}),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/No fields to update/i);
  });

  it('never lets a client write retired work: only reconciliation and Revalidate do', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'run-1', user_id: 'user-123', team_id: null, title: 'Run', items: '[]', status: 'in_progress', revision: 1 },
    ]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Renamed', retired_items: '[]', retiredItems: [] }),
    }), mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalled();
    for (const [values] of dbMocks.updateChain.set.mock.calls) {
      expect(values).not.toHaveProperty('retired_items');
      expect(values).not.toHaveProperty('retiredItems');
    }
  });

  it('should update team-owned checklist runs for team runners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
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
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const request = new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ status: 'completed' }),
    });

    const response = await handleChecklists(request, mockEnv);
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

  it('should hide archived checklist runs from normal detail reads', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'in_progress',
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
  });

  it('should archive checklist runs with deleted_at instead of hard deleting', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        is_public: true,
        share_token: 'share-token',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1', { method: 'DELETE' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.db.delete).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        is_public: false,
        share_token: null,
      }),
    );
  });

  it('should list archived checklist runs for the active personal workspace', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'completed',
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/checklists/archived', { method: 'GET' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        title: 'Archived Run',
        deleted_at: '2026-07-03T12:00:00.000Z',
      }),
    );
  });

  it('should restore archived checklist runs privately and audit the restore', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Archived Run',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        share_token: null,
        deleted_at: '2026-07-03T12:00:00.000Z',
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run-1/restore', { method: 'POST' });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: null,
        is_public: false,
        share_token: null,
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.restored',
        resource_type: 'checklist_run',
        resource_id: 'run-1',
      }),
    );
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

  it('should create share links for personal checklist run owners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Personal Run',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('run-1');
    expect(data.sharePath).toMatch(/^\/share\//);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_token: expect.any(String),
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        resource_type: 'checklist_run',
        resource_id: 'run-1',
      }),
    );
  });

  it('should create share links for team checklist runs when the user can run team templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'creator-1',
          team_id: 'team-1',
          title: 'Team Run',
          items: '[]',
          status: 'in_progress',
          is_public: false,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('run-1');
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: true,
        share_token: expect.any(String),
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        subject_type: 'team',
        subject_id: 'team-1',
        resource_id: 'run-1',
      }),
    );
  });

  it('should reject team checklist share links for viewers', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'creator-1',
          team_id: 'team-1',
          title: 'Team Run',
          items: '[]',
          status: 'in_progress',
          is_public: false,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(403);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('should serve shared checklist runs without authentication', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        template_id: 'template-2',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        user_id: 'owner-123',
        share_token: 'shared-run',
        is_public: true,
        revision: 3,
        template_version: 1,
        current_template_version: 2,
      },
    ]);

    const request = new Request('http://localhost/api/checklists/shared/shared-run', {
      method: 'GET',
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, runBody);

    expect(response.status).toBe(200);
    expect(data.id).toBe('shared-run');
    expect(data.title).toBe('Shared Run');
    expect(data.is_stale).toBe(true);
    expect(data.template_version).toBe(1);
    expect(data.current_template_version).toBe(2);
  });

  it('leaves retired work out of shared runs: its notes were written while the run was private', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[]',
        retired_items: JSON.stringify([
          { kind: 'item', sectionId: 's1', item: { id: 'item-dns', title: 'Check DNS', notes: 'Registrar login is in vault X' } },
        ]),
        share_token: 'shared-run',
        is_public: true,
      },
    ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run'), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).not.toHaveProperty('retired_items');
    expect(JSON.stringify(data)).not.toContain('vault X');
  });

  it('gives share-link guests exactly the run fields the share page needs, so a column added later stays private', async () => {
    const sharedRunKeys = [
      'completed_at', 'current_template_version', 'id', 'is_public', 'is_stale', 'items', 'progress',
      'revision', 'started_at', 'status', 'template_version', 'title',
    ];
    const everyColumn = Object.fromEntries(
      Object.keys(getTableColumns(schema.checklist_runs)).map((column) => [column, `value-${column}`]),
    );
    const privateValues = {
      user_id: 'owner-secret-id',
      team_id: 'org-secret-id',
      template_id: 'template-secret-id',
      created_by_user_id: 'creator-secret-id',
      assigned_to_user_id: 'assignee-secret-id',
      started_by_user_id: 'starter-secret-id',
      completed_by_user_id: 'completer-secret-id',
      retired_items: JSON.stringify([{ id: 'retired-1', title: 'Old task', notes: 'retired-secret-note' }]),
    };
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      ...everyColumn,
      ...privateValues,
      title: 'Shared Run',
      items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
      status: 'in_progress',
      progress: 0,
      is_public: true,
      completed_at: null,
      revision: 4,
      template_version: 1,
      current_template_version: 2,
    }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/shared-run'), mockEnv);
    const text = await response.text();
    const data = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(sharedRunKeys);
    for (const value of Object.values(privateValues)) expect(text).not.toContain(value);
    expect(text).not.toContain('retired-secret-note');
    expect(data).toMatchObject({ revision: 4, template_version: 1, current_template_version: 2, is_stale: true, is_public: true });
    const columnsReadFromD1 = Object.keys((dbMocks.db.select.mock.calls[0] as unknown[])[0] as object);
    expect(columnsReadFromD1.sort()).toEqual(sharedRunKeys.filter((key) => key !== 'is_stale' && key !== 'is_public'));
  });

  it('should update completion on shared checklist runs without changing their tasks', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        template_id: 'template-2',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        user_id: 'owner-123',
        team_id: null,
        share_token: 'shared-run',
        is_public: true,
        revision: 3,
      },
    ]);

    const request = new Request('http://localhost/api/checklists/shared/shared-run', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: '1', title: 'Renamed', items: [{ id: 'item-1', title: 'Renamed item', isCompleted: true }] }],
        status: 'completed',
        expected_revision: 3,
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revision).toBe(4);
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(JSON.parse(update.items)).toEqual([
      { id: '1', title: 'Checklist', items: [{ id: 'item-1', title: 'Item 1', isCompleted: true }] },
    ]);
    expect(update).toEqual(expect.objectContaining({ status: 'completed', progress: 100 }));
    const batchStatements = dbMocks.db.batch.mock.calls[0][0];
    expect(batchStatements).toHaveLength(2);
    const [, runUpdateAfterTheGuardedAudit] = batchStatements;
    expect(runUpdateAfterTheGuardedAudit).toBe(dbMocks.updateChain);
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.shared_updated',
        actor_user_id: null,
        resource_type: 'checklist_run',
        resource_id: 'shared-run',
      }),
    );
  });

  it('should reject shared checklist updates when the share token is not active', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/checklists/shared/missing-run', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: '1', title: 'Checklist', items: [] }],
        expected_revision: 1,
      }),
    });

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('answers an unknown share token before reading the request body', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);
    let bodyPulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyPulled = true;
          controller.enqueue(new TextEncoder().encode('{"sections":['));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    const request = new Request('http://localhost/api/checklists/shared/missing-run', {
      method: 'PUT',
      body,
      duplex: 'half',
    } as RequestInit);

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(request.bodyUsed).toBe(false);
    expect(bodyPulled).toBe(false);
  });

  it('rejects stale private run writes before they can discard template evolution', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        revision: 5,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: 'section-1', title: 'Stale', items: [] }],
        expected_revision: 4,
      }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('reports a conflict when a run changes between the read and conditional write', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        title: 'Run',
        items: '[]',
        status: 'in_progress',
        revision: 5,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    const guardedAuditInsertAndUpdateBothMiss = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(guardedAuditInsertAndUpdateBothMiss);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Concurrent edit', expected_revision: 5 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
  });

  it('explicitly revalidates a completed run against the current template', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'user-123',
          team_id: null,
          template_id: 'template-1',
          title: 'Completed run',
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Old',
              items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Preserve' }],
            },
          ]),
          retired_items: '[]',
          status: 'completed',
          template_version: 1,
          revision: 2,
          is_public: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          version: 3,
          owner_type: 'user',
          team_id: null,
          user_id: 'user-123',
          is_public: false,
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Current',
              items: [
                { id: 'item-1', title: 'Renamed' },
                { id: 'item-2', title: 'New requirement' },
              ],
            },
          ]),
        },
      ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({
      success: true,
      progress: 50,
      revision: 3,
      template_version: 3,
    }));
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(update).toEqual(expect.objectContaining({
      status: 'in_progress',
      completed_at: null,
      template_version: 3,
    }));
    expect(JSON.parse(update.items)[0].items).toEqual([
      expect.objectContaining({ id: 'item-1', title: 'Renamed', isCompleted: true, notes: 'Preserve' }),
      expect.objectContaining({ id: 'item-2', isCompleted: false }),
    ]);
  });

  it('revalidates a run whose task the template moved to another section without resetting it', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{
        id: 'run-1', user_id: 'user-123', team_id: null, template_id: 'template-1', title: 'Completed run',
        items: JSON.stringify([
          { id: 'A', title: 'Plan', items: [{ id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' }] },
          { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish', isCompleted: true }] },
        ]),
        retired_items: '[]', status: 'in_progress', template_version: 1, revision: 2, is_public: false,
        started_at: new Date().toISOString(), created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{
        id: 'template-1', version: 2, owner_type: 'user', team_id: null, user_id: 'user-123', is_public: false,
        items: JSON.stringify([
          { id: 'A', title: 'Plan', items: [] },
          { id: 'B', title: 'Ship', items: [{ id: 'z', title: 'Publish' }, { id: 'x', title: 'Call vendor' }] },
        ]),
      }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ progress: 100 }));
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(JSON.parse(update.items)[1].items[1]).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(JSON.parse(update.retired_items)).toEqual([]);
  });

  it('names the work a revalidate retired in its Changelog event', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        items: JSON.stringify([{ id: 'section-1', title: 'Launch', items: [
          { id: 'item-dns', title: 'Check DNS', isCompleted: true, notes: 'Registrar login is in vault X' },
          { id: 'item-copy', title: 'Write copy' },
        ] }]),
        retired_items: '[]',
        status: 'in_progress',
        template_version: 1,
        revision: 2,
      }])
      .mockResolvedValueOnce([{
        id: 'template-1',
        version: 2,
        owner_type: 'user',
        team_id: null,
        user_id: 'user-123',
        is_public: false,
        items: JSON.stringify([{ id: 'section-1', title: 'Launch', items: [{ id: 'item-copy', title: 'Write copy' }] }]),
      }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const auditEvent = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values.action === 'checklist_run.revalidated');
    expect(JSON.parse(auditEvent.metadata_json)).toEqual({
      templateId: 'template-1',
      templateVersion: 2,
      retired: [{ kind: 'item', id: 'item-dns', title: 'Check DNS' }],
    });
    expect(JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].retired_items)).toEqual([
      expect.objectContaining({ item: expect.objectContaining({ id: 'item-dns', notes: 'Registrar login is in vault X' }) }),
    ]);
  });

  it('revalidates a completed run so a task with a new Sub-task is no longer complete', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          user_id: 'user-123',
          team_id: null,
          template_id: 'template-1',
          title: 'Completed run',
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Launch',
              items: [{
                id: 'item-1',
                title: 'Write copy',
                isCompleted: true,
                contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short', isCompleted: true }] }],
              }],
            },
          ]),
          retired_items: '[]',
          status: 'completed',
          template_version: 1,
          revision: 2,
          is_public: false,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          version: 3,
          owner_type: 'user',
          team_id: null,
          user_id: 'user-123',
          is_public: false,
          items: JSON.stringify([
            {
              id: 'section-1',
              title: 'Launch',
              items: [{
                id: 'item-1',
                title: 'Write copy',
                contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }, { id: 'sub-2', title: 'Tagline' }] }],
              }],
            },
          ]),
        },
      ]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 2 }),
    }), mockEnv);
    const data = await readJson(response, progressBody);

    expect(response.status).toBe(200);
    expect(data.progress).toBeLessThan(100);
    const update = dbMocks.updateChain.set.mock.calls[0][0];
    expect(update.status).toBe('in_progress');
    expect(JSON.parse(update.items)[0].items[0]).toEqual(expect.objectContaining({ id: 'item-1', isCompleted: false }));
  });
});
