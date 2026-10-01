import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createdBody, dbMocks, mockEnv, resetTemplatesHandlerMocks } from '../../../support/templatesHandler';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForContext } from '@functions/api/utils/entitlements';
import { columnNamesIn } from '../../../support/drizzleSql';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Templates Handlers', () => {
  beforeEach(resetTemplatesHandlerMocks);

  it('should reject unauthenticated template creation', async () => {
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Template' }),
    });

    const response = await handleTemplates(request, mockEnv);
    expect(response.status).toBe(401);
  });

  it('creates templates storing sections JSON, last active at creation so "Most Recent" can sort them', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        title: 'New Template',
        items: [{ id: 'item-1', title: 'Item 1' }],
        tags: ['alpha'],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, createdBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(data.slug).toBeDefined();

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    const storedItems = JSON.parse(inserted.items);
    const personalLimitPredicate = dbMocks.selectChain.where.mock.calls[0][0];
    const personalLimitColumns = columnNamesIn(personalLimitPredicate);
    expect(Array.isArray(storedItems)).toBe(true);
    expect(storedItems[0].items).toHaveLength(1);
    expect(inserted.version).toBe(1);
    expect(inserted.updated_at).toEqual(expect.any(String));
    expect(inserted.updated_at).toBe(inserted.created_at);
    expect(personalLimitColumns).toContain('owner_type');
    expect(personalLimitColumns).toContain('user_id');
    expect(personalLimitColumns).toContain('team_id');
    expect(personalLimitColumns).toContain('deleted_at');
  });

  it('should create team-owned templates for team editors', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForContext).mockResolvedValue({
      plan: 'team',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' }])
      .mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        teamId: 'team-1',
        title: 'Team Template',
        sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, createdBody);

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
      mockEnv,
      expect.objectContaining({ type: 'team', teamId: 'team-1', userId: 'user-123' }),
    );

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.owner_type).toBe('team');
    expect(inserted.team_id).toBe('team-1');
    expect(inserted.created_by_user_id).toBe('user-123');
  });

  it('should persist requested SEO metadata and slug on template creation', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        title: 'SEO Template',
        seoTitle: 'SEO Title',
        seoDescription: 'Search-ready description',
        rules: [
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ],
        slug: 'custom-seo-template',
        sections: [{ id: 'section-1', title: 'Checklist', items: [] }],
      }),
    });

    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(200);

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.slug).toBe('custom-seo-template');
    expect(inserted.seo_title).toBe('SEO Title');
    expect(inserted.seo_description).toBe('Search-ready description');
    expect(inserted.rules).toContain('required-field');
  });

  it('should enforce free plan template limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 1 }]);

    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        title: 'New Template',
        items: [{ id: 'item-1', title: 'Item 1' }],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });
});
