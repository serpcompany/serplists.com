import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, successBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('names the invalid field in template payload errors, after reading the stored row since bounds apply to changed fields only', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', items: '[]', version: 1, is_public: false },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ seoDescription: 'x'.repeat(321), expected_version: 1 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toContain('seoDescription');
    expect(data.details).toEqual(expect.objectContaining({ field: 'seoDescription' }));
  });

  it('should reject invalid sections payloads on update', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ sections: 'not-json' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/sections\/items/i);
  });

  it('should update SEO metadata and requested slug on template update', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
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

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
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
      }),
    });

    const response = await handleTemplates(request, mockEnv);
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
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Current template',
        items: '[]',
        version: 3,
        is_public: false,
      },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Stale edit', expected_version: 2 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('requires expected_version for a template content update instead of skipping the check', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Current template',
        items: '[]',
        version: 6,
        is_public: false,
      },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Edit from a tab that never learned the version',
        sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('still allows a visibility-only update without expected_version', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Current template',
        items: '[]',
        version: 6,
        is_public: false,
      },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ is_public: true }),
    }), mockEnv);

    expect(response.status).toBe(200);
  });

  it('returns the saved version so the editor can send it on its next save', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Current template',
        items: '[]',
        version: 3,
        content_version: 2,
        is_public: false,
      },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Edited',
        sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
        expected_version: 3,
      }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ success: true, version: 4, content_version: 3 }));
  });

  it('reports a conflict when a template changes between the read and conditional write', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Current template',
        items: '[]',
        version: 3,
        content_version: 2,
        is_public: false,
      },
    ]);
    const auditVersionAndUpdateAllMissed = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(auditVersionAndUpdateAllMissed);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Concurrent edit', expected_version: 3 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
  });
});
