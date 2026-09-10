import { recordIntegrationScenario } from '../../../../scripts/data/data-regression-report-lib.mjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/No fields to update/i);
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
          retired_items: '[]',
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        completed_by_user_id: 'user-123',
      }),
    );
  });

  it('should return checklist run history for active team members', async () => {
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.subject).toEqual({ type: 'team', id: 'team-1' });
    expect(data.events[0]).toEqual(
      expect.objectContaining({
        action: 'checklist_run.updated',
        actor: expect.objectContaining({ name: 'Runner Example' }),
        diff: { status: 'completed' },
      }),
    );
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
    const data = await response.json();

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
    const data = await response.json();

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
        retired_items: '[]', // 0024 applies this NOT NULL default to every stored run.
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
    const data = await response.json();

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

  it('should create a public shared checklist run', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-2', title: 'Template 2', items: '[{"id":"item-1","title":"Item 1"}]', is_public: 1, user_id: 'user-123' }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const request = new Request('http://localhost/api/checklists/template-2/share', {
      method: 'POST',
      body: JSON.stringify({ runName: 'Named Shared Run' }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(typeof data.id).toBe('string');
    expect(typeof data.shareToken).toBe('string');
    expect(data.sharePath).toMatch(/^\/share\//);

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.title).toBe('Named Shared Run');
    expect(inserted.team_id).toBeNull();
    expect(inserted.is_public).toBe(true);
    expect(typeof inserted.share_token).toBe('string');
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        subject_type: 'user',
        subject_id: 'user-123',
        resource_id: inserted.id,
      }),
    );
  });

  it('should deactivate any existing shared runs before creating a new shared run', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-2', title: 'Template 2', items: '[{"id":"item-1","title":"Item 1"}]', is_public: 1, user_id: 'user-123' }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const request = new Request('http://localhost/api/checklists/template-2/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        is_public: false,
        share_expires_at: expect.any(String),
        status: 'completed',
      })
    );
    expect(dbMocks.updateChain.where).toHaveBeenCalled();
  });

  it('should create audited shared runs from private team templates for team runners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'team',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-team',
          user_id: 'creator-1',
          owner_type: 'team',
          team_id: 'team-1',
          title: 'Team Template',
          items: '[{"id":"item-1","title":"Item 1"}]',
          is_public: false,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/template-team/share', {
      method: 'POST',
      body: JSON.stringify({ runName: 'Team Shared Run' }),
    });
    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sharePath).toMatch(/^\/share\//);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted).toEqual(
      expect.objectContaining({
        team_id: 'team-1',
        title: 'Team Shared Run',
        is_public: true,
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'checklist_run.share_created',
        subject_type: 'team',
        subject_id: 'team-1',
        resource_id: inserted.id,
      }),
    );
  });

  it('should reject shared runs from private team templates for viewers', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-team',
          user_id: 'creator-1',
          owner_type: 'team',
          team_id: 'team-1',
          title: 'Team Template',
          items: '[{"id":"item-1","title":"Item 1"}]',
          is_public: false,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ]);

    const request = new Request('http://localhost/api/checklists/template-team/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(403);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
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
    const data = await response.json();

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
    const data = await response.json();

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
        retired_items: '[]',
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe('shared-run');
    expect(data.title).toBe('Shared Run');
    expect(data.is_stale).toBe(true);
    expect(data.template_version).toBe(1);
    expect(data.current_template_version).toBe(2);
  });

  it('should update shared checklist runs', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'shared-run',
        template_id: 'template-2',
        title: 'Shared Run',
        status: 'in_progress',
        items: '[{"id":"item-1","title":"Item 1","isCompleted":false}]',
        retired_items: '[]',
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
        sections: [{ id: '1', title: 'Checklist', items: [] }],
        status: 'completed',
        expected_revision: 3,
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.revision).toBe(4);
    expect(dbMocks.updateChain.set).toHaveBeenCalled();
    const batchStatements = dbMocks.db.batch.mock.calls[0][0];
    expect(batchStatements).toHaveLength(2);
    expect(batchStatements[0]).toBe(dbMocks.updateChain);
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
      }),
    });

    const response = await handleChecklists(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
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
        retired_items: '[]',
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
    const data = await response.json();

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
        retired_items: '[]',
        status: 'in_progress',
        revision: 5,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 1 } }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Concurrent edit', expected_revision: 5 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
    recordIntegrationScenario('run-optimistic-concurrency');
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
    recordIntegrationScenario('explicit-completed-run-revalidation');
  });
});
