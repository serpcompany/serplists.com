import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, expectSuccessUpdating, mockEnv, PRO_PLAN, resetTemplatesHandlerMocks } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { ARCHIVED_AT, personalTemplateRow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { jsonObjects, readJson } from '../../../support/readJson';

function storedTemplate(overrides: Record<string, unknown>) {
  return personalTemplateRow({
    description: '',
    items: '[]',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: null,
    ...overrides,
  });
}

describe('Templates Handlers', () => {
  beforeEach(() => {
    resetTemplatesHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('should hide archived templates from normal detail reads', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      storedTemplate({
        title: 'Archived Public Template',
        is_public: true,
        slug: 'archived-public-template',
        deleted_at: ARCHIVED_AT,
      }),
    ]);

    const response = await handleTemplates(apiRequest('templates/template-1'), mockEnv);

    expect(response.status).toBe(404);
  });

  it('should archive templates with deleted_at instead of hard deleting', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      storedTemplate({ title: 'Existing Template', is_public: true, slug: 'existing-template' }),
    ]);

    const response = await handleTemplates(apiRequest('templates/template-1', 'DELETE'), mockEnv);

    expect(dbMocks.db.delete).not.toHaveBeenCalled();
    await expectSuccessUpdating(response, { deleted_at: expect.any(String), is_public: false, updated_by_user_id: 'user-123' });
  });

  it('should list archived templates for the active personal workspace', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      storedTemplate({
        title: 'Archived Template',
        is_public: false,
        slug: 'archived-template',
        deleted_at: ARCHIVED_AT,
        updated_at: ARCHIVED_AT,
      }),
    ]);

    const response = await handleTemplates(apiRequest('templates/archived'), mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(
      expect.objectContaining({
        id: 'template-1',
        title: 'Archived Template',
        deleted_at: ARCHIVED_AT,
      }),
    );
  });

  it('should restore archived templates privately and audit the restore', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(PRO_PLAN);
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      storedTemplate({ title: 'Archived Template', is_public: false, deleted_at: ARCHIVED_AT, updated_at: ARCHIVED_AT }),
    ]);

    const response = await handleTemplates(apiRequest('templates/template-1/restore', 'POST'), mockEnv);

    await expectSuccessUpdating(response, { deleted_at: null, is_public: false, updated_by_user_id: 'user-123' });
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'template.restored',
        resource_type: 'template',
        resource_id: 'template-1',
      }),
    );
  });
});
