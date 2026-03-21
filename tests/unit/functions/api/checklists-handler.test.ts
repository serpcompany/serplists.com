import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
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
}));

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

describe('Checklists Handlers', () => {
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockResolvedValue(undefined);
    dbMocks.deleteChain.where.mockResolvedValue(undefined);

    mockEnv = {
      DB: {},
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    };

    vi.mocked(getSessionUserId).mockResolvedValue(null);
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
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

  it('should create a public shared checklist run', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-2', title: 'Template 2', items: '[{"id":"item-1","title":"Item 1"}]', is_public: 1, user_id: 'user-123' }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const request = new Request('http://localhost/api/checklists/template-2/share', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(typeof data.id).toBe('string');
    expect(typeof data.shareToken).toBe('string');
    expect(data.sharePath).toMatch(/^\/run\/shared\//);

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.is_public).toBe(true);
    expect(typeof inserted.share_token).toBe('string');
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
  });

  it('should update shared checklist runs', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);

    const request = new Request('http://localhost/api/checklists/shared/shared-run', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [{ id: '1', title: 'Checklist', items: [] }],
        status: 'completed',
      }),
    });

    const response = await handleChecklists(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalled();
  });
});
