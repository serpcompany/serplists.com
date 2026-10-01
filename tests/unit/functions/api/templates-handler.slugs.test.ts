import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbMocks, mockEnv, resetTemplatesHandlerMocks, slugBody } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { paramValuesIn } from '../../../support/drizzleSql';
import { apiErrorBody, readJson } from '../../../support/readJson';

const templateWithASlugTheMigrationBackfillsLeftUnstripped = () => ({
  id: 'template-1',
  user_id: 'user-123',
  owner_type: 'user',
  team_id: null,
  title: 'Q&A: Launch plan',
  description: '',
  items: '[]',
  version: 3,
  is_public: false,
  slug: 'qanda:-launch-plan-1a2b3c4d',
  created_at: new Date().toISOString(),
  updated_at: null,
});

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('keeps a suffixed slug within the slug limit when the title slug is taken', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const templatesCounted: never[] = [];
    const templatesHoldingTheBaseSlug = [{ id: 'other-template' }];
    const templatesHoldingTheSuffixedSlug: never[] = [];
    dbMocks.selectChain.limit
      .mockResolvedValueOnce(templatesCounted)
      .mockResolvedValueOnce(templatesHoldingTheBaseSlug)
      .mockResolvedValueOnce(templatesHoldingTheSuffixedSlug);

    const response = await handleTemplates(new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ title: 'a'.repeat(160), sections: [] }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.slug.length).toBeLessThanOrEqual(160);
    expect(inserted.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('keeps a conflict-suffixed slug within the slug limit on update', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, items: '[]', version: 1, is_public: false },
      ])
      .mockResolvedValueOnce([{ id: 'other-template' }]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'b'.repeat(160), expected_version: 1 }),
    }), mockEnv);

    expect(response.status).toBe(200);
    const storedSlug = dbMocks.updateChain.set.mock.calls[0][0].slug;
    expect(storedSlug.length).toBeLessThanOrEqual(160);
    expect(storedSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('returns the suffixed slug it stored when the requested slug is taken, so the editor shows it without guessing', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: '1a2b3c4d-template', user_id: 'user-123', owner_type: 'user', team_id: null, items: '[]', version: 1, is_public: false, slug: 'old-slug' },
      ])
      .mockResolvedValueOnce([{ id: 'other-template' }]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/1a2b3c4d-template', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'moving-checklist', expected_version: 1 }),
    }), mockEnv);
    const data = await readJson(response, slugBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe('moving-checklist-1a2b3c4d');
    expect(dbMocks.updateChain.set.mock.calls[0][0].slug).toBe(data.slug);
  });

  it('keeps and returns the stored slug when a title edit requests none, so shared links keep working', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, items: '[]', version: 1, is_public: false, slug: 'existing-template' },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Edited', expected_version: 1 }),
    }), mockEnv);
    const data = await readJson(response, slugBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe('existing-template');
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('slug');
  });

  describe('slugs made from titles in any language', () => {
    const create = (body: Record<string, unknown>) => handleTemplates(new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ sections: [{ id: 's1', title: 'S', items: [] }], ...body }),
    }), mockEnv);

    it.each([
      ['Café Opening Checklist', 'cafe-opening-checklist'],
      ['Umzugscheckliste für Familien', 'umzugscheckliste-fur-familien'],
      ['Straße fegen', 'strasse-fegen'],
      ['Список покупок', 'template'],
    ])('creates %s at /%s', async (title, slug) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await create({ title });
      const data = await readJson(response, slugBody);

      expect(response.status).toBe(200);
      expect(data.slug).toBe(slug);
      expect(dbMocks.insertChain.values.mock.calls[0][0]).toEqual(expect.objectContaining({ slug }));
    });

    it('folds the letters of a custom slug typed with accents', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{ id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', items: '[]', slug: 'plan', version: 1, is_public: false }])
        .mockResolvedValueOnce([]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ slug: 'café-guide', expected_version: 1 }),
      }), mockEnv);
      const data = await readJson(response, slugBody);

      expect(response.status).toBe(200);
      expect(data.slug).toBe('cafe-guide');
    });

    it('rejects a custom slug with no letters it can use instead of silently keeping the old one', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', items: '[]', slug: 'plan', version: 1, is_public: false },
      ]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ title: 'Plan v2', slug: 'Список', expected_version: 1 }),
      }), mockEnv);
      const data = await readJson(response, apiErrorBody);

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/^slug: /);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });
  });

  it('saves a template whose stored legacy slug is echoed back unchanged', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([templateWithASlugTheMigrationBackfillsLeftUnstripped()]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        title: 'Q&A: Launch plan (fixed typo)',
        slug: 'qanda:-launch-plan-1a2b3c4d',
        expected_version: 3,
      }),
    });

    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(200);
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    expect(updates).toEqual(expect.objectContaining({ title: 'Q&A: Launch plan (fixed typo)' }));
    expect(updates).not.toHaveProperty('slug');
  });

  it('toggles visibility on a template with a legacy slug', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([templateWithASlugTheMigrationBackfillsLeftUnstripped()]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ is_public: true, slug: 'qanda:-launch-plan-1a2b3c4d' }),
    });

    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(200);
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    expect(updates).toEqual(expect.objectContaining({ is_public: true }));
    expect(updates).not.toHaveProperty('slug');
  });

  it('still rejects a changed slug the slug rule cannot keep anything of', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([templateWithASlugTheMigrationBackfillsLeftUnstripped()]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Launch plan', slug: '?!?' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/^slug: /);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('rejects a PUT whose only field is the unchanged slug', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([templateWithASlugTheMigrationBackfillsLeftUnstripped()]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ slug: 'qanda:-launch-plan-1a2b3c4d' }),
    });

    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(400);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('decodes percent-encoded slugs before looking them up', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { ...templateWithASlugTheMigrationBackfillsLeftUnstripped(), is_public: 1, owner_username: 'owner' },
    ]);

    const request = new Request(
      `http://localhost/api/templates/slug/${encodeURIComponent('qanda:-launch-plan-1a2b3c4d')}`,
      { method: 'GET' },
    );
    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, slugBody);

    expect(response.status).toBe(200);
    expect(data.slug).toBe('qanda:-launch-plan-1a2b3c4d');
    const whereArg = dbMocks.selectChain.where.mock.calls[0][0];
    expect(paramValuesIn(whereArg)).toContain('qanda:-launch-plan-1a2b3c4d');
  });

  it('answers a malformed percent-encoded slug with 404', async () => {
    const request = new Request('http://localhost/api/templates/slug/%E0%A4%A', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.selectChain.limit).not.toHaveBeenCalled();
  });
});
