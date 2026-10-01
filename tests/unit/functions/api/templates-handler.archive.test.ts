import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, successBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { jsonObjects, readJson } from '../../../support/readJson';

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should hide archived templates from normal detail reads', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Archived Public Template',
        description: '',
        items: '[]',
        version: 1,
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        is_public: true,
        slug: 'archived-public-template',
        deleted_at: '2026-07-03T12:00:00.000Z',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(404);
  });

  it('should archive templates with deleted_at instead of hard deleting', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Existing Template',
        description: '',
        items: '[]',
        version: 1,
        is_public: true,
        slug: 'existing-template',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', { method: 'DELETE' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.db.delete).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        is_public: false,
        updated_by_user_id: 'user-123',
      }),
    );
  });

  it('should list archived templates for the active personal workspace', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Archived Template',
        description: '',
        items: '[]',
        version: 1,
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        is_public: false,
        slug: 'archived-template',
        deleted_at: '2026-07-03T12:00:00.000Z',
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/templates/archived', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        id: 'template-1',
        title: 'Archived Template',
        deleted_at: '2026-07-03T12:00:00.000Z',
      }),
    );
  });

  it('should restore archived templates privately and audit the restore', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Archived Template',
        description: '',
        items: '[]',
        version: 1,
        is_public: false,
        deleted_at: '2026-07-03T12:00:00.000Z',
        created_at: new Date().toISOString(),
        updated_at: '2026-07-03T12:00:00.000Z',
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1/restore', { method: 'POST' });
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: null,
        is_public: false,
        updated_by_user_id: 'user-123',
      }),
    );
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'template.restored',
        resource_type: 'template',
        resource_id: 'template-1',
      }),
    );
  });
});
