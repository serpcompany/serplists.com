import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, successBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { personalTemplateRow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

const putTemplate = (body: Record<string, unknown>) => handleTemplates(apiRequest('templates/template-1', 'PUT', body), mockEnv);

function theStoredTemplate(overrides: Record<string, unknown>) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([
    personalTemplateRow({ title: 'Current template', items: '[]', is_public: false, ...overrides }),
  ]);
}

async function expectEditConflict(response: Response) {
  const data = await readJson(response, apiErrorBody);

  expect(response.status).toBe(409);
  expect(data.code).toBe('edit_conflict');
}

describe('Templates Handlers', () => {
  beforeEach(() => {
    resetTemplatesHandlerMocks();
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('names the invalid field in template payload errors, after reading the stored row since bounds apply to changed fields only', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      personalTemplateRow({ title: 'Plan', items: '[]', version: 1, is_public: false }),
    ]);

    const response = await putTemplate({ seoDescription: 'x'.repeat(321), expected_version: 1 });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toContain('seoDescription');
    expect(data.details).toEqual(expect.objectContaining({ field: 'seoDescription' }));
  });

  it('should reject invalid sections payloads on update', async () => {
    const response = await putTemplate({ sections: 'not-json' });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/sections\/items/i);
  });

  it('should update SEO metadata and requested slug on template update', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          user_id: 'user-123',
          title: 'Existing Template',
          description: '',
          items: '[]',
          version: 1,
          is_public: false,
          slug: 'existing-template',
          created_at: new Date().toISOString(),
          updated_at: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await putTemplate({
      seoTitle: 'Updated SEO Title',
      seoDescription: 'Updated SEO Description',
      rules: [
        {
          id: 'rule-2',
          type: 'required-field',
          path: 'sections[].items[].title',
          value: 'Updated rule',
          severity: 'warning',
        },
      ],
      slug: 'updated-template-slug',
      expected_version: 1,
    });
    const data = await readJson(response, successBody);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        seo_title: 'Updated SEO Title',
        seo_description: 'Updated SEO Description',
        rules: expect.stringContaining('Updated rule'),
        slug: 'updated-template-slug',
      }),
    );
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('content_version');
  });

  it('rejects a stale template editor version before writing', async () => {
    theStoredTemplate({ version: 3 });

    await expectEditConflict(await putTemplate({ title: 'Stale edit', expected_version: 2 }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('requires expected_version for a template content update instead of skipping the check', async () => {
    theStoredTemplate({ version: 6 });

    await expectEditConflict(await putTemplate({
      title: 'Edit from a tab that never learned the version',
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('still allows a visibility-only update without expected_version', async () => {
    theStoredTemplate({ version: 6 });

    const response = await putTemplate({ is_public: true });

    expect(response.status).toBe(200);
  });

  it('returns the saved version so the editor can send it on its next save', async () => {
    theStoredTemplate({ version: 3, content_version: 2 });

    const response = await putTemplate({
      title: 'Edited',
      sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      expected_version: 3,
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ success: true, version: 4, content_version: 3 }));
  });

  it('reports a conflict when a template changes between the read and conditional write', async () => {
    theStoredTemplate({ version: 3, content_version: 2 });
    const auditVersionAndUpdateAllMissed = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(auditVersionAndUpdateAllMissed);

    await expectEditConflict(await putTemplate({ title: 'Concurrent edit', expected_version: 3 }));
  });
});
