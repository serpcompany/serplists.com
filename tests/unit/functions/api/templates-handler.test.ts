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

import { handleTemplates } from '@functions/api/handlers/templates';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';

describe('Templates Handlers', () => {
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

  it('should list templates and normalize legacy items', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Legacy Template',
        items: JSON.stringify([{ id: 'item-1', title: 'Item 1' }]),
        category: '["seo"]',
        tags: '["tag-1"]',
        user_id: 'user-1',
        is_public: 1,
        owner_username: 'alice',
        owner_full_name: 'Alice Example',
      },
    ]);

    const request = new Request('http://localhost/api/templates', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].sections).toHaveLength(1);
    expect(data[0].sections[0].items).toHaveLength(1);
    expect(data[0].categories).toEqual(['seo']);
    expect(data[0].tags).toEqual(['tag-1']);
    expect(data[0].ownerProfile).toEqual({
      username: 'alice',
      full_name: 'Alice Example',
    });
  });

  it('should reject unauthenticated template creation', async () => {
    const request = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Template' }),
    });

    const response = await handleTemplates(request, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should create templates and store sections JSON', async () => {
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(data.slug).toBeDefined();

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    const storedItems = JSON.parse(inserted.items);
    expect(Array.isArray(storedItems)).toBe(true);
    expect(storedItems[0].items).toHaveLength(1);
    expect(inserted.version).toBe(1);
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
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });

  it('should reject invalid sections payloads on update', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ sections: 'not-json' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/sections\/items/i);
  });

  it('should update SEO metadata and requested slug on template update', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

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
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

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
  });

  it('should update related checklist runs when template sections change', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [
          {
            id: 'section-1',
            title: 'Checklist',
            items: [{
              id: 'item-1',
              title: 'Start with your project',
              isCompleted: false,
              contents: [],
            }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(2);
  });

  it('should return saved SEO metadata in template responses', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'SEO Template',
        description: 'Stored template',
        items: JSON.stringify([{ id: 'section-1', title: 'Checklist', items: [] }]),
        category: '["seo"]',
        tags: '["content"]',
        user_id: 'user-1',
        is_public: 1,
        slug: 'seo-template',
        seo_title: 'Stored SEO Title',
        seo_description: 'Stored SEO description',
        rules: JSON.stringify([
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ]),
        type: 'checklist',
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe('seo-template');
    expect(data.seoTitle).toBe('Stored SEO Title');
    expect(data.seoDescription).toBe('Stored SEO description');
    expect(data.rules).toHaveLength(1);
  });

  it('should reject template backup export for free users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const request = new Request('http://localhost/api/templates/backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('upgrade_required');
  });

  it('should export backup format for pro users when requested', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });

    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Template',
        description: '',
        items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
        category: '["seo"]',
        tags: '["tag-1"]',
        user_id: 'user-123',
        is_public: 0,
        slug: 'template',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const request = new Request('http://localhost/api/templates/backup?format=backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.version).toBe('1.0.0');
    expect(Array.isArray(data.templates)).toBe(true);
    expect(data.templates[0].version).toBe(1);
  });

  it('should import templates from backup for pro users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Imported',
            sections: [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }],
            isPublic: false,
          },
        ],
        options: { visibility: 'private' },
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.imported).toBe(1);
    expect(data.failed).toEqual([]);
    expect(data.successes).toEqual([
      expect.objectContaining({
        index: 0,
        title: 'Imported',
        visibility: 'private',
      }),
    ]);
  });

  it('should return per-template partial import results when some templates fail', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Imported',
            sections: [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }],
            isPublic: false,
          },
          {
            title: 'Broken Template',
            sections: 'not-json',
            isPublic: false,
          },
        ],
        options: { visibility: 'private' },
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.imported).toBe(1);
    expect(data.successes).toHaveLength(1);
    expect(data.failed).toEqual([
      expect.objectContaining({
        index: 1,
        title: 'Broken Template',
        code: 'invalid_sections',
      }),
    ]);
  });

  it('should return structured failure details when all imported templates fail', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        templates: [
          {
            title: 'Broken Template A',
            sections: 'not-json',
          },
          {
            title: 'Broken Template B',
            sections: 'still-not-json',
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('template_import_failed');
    expect(data.details).toEqual(
      expect.objectContaining({
        total: 2,
        imported: 0,
        failed: [
          expect.objectContaining({ title: 'Broken Template A', code: 'invalid_sections' }),
          expect.objectContaining({ title: 'Broken Template B', code: 'invalid_sections' }),
        ],
      }),
    );
  });

  it('should allow cloning templates for free users within template limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          title: 'Public Template',
          description: '',
          items: JSON.stringify([]),
          category: '[]',
          tags: '[]',
          user_id: 'other-user',
          is_public: true,
          slug: 'public-template',
          created_at: new Date().toISOString(),
          updated_at: null,
          version: 1,
        },
      ]);

    const request = new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
  });

  it('should reject cloning templates when free user reaches template limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 1 }]);

    const request = new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe('limit_reached');
  });

  it('should clone a public template for pro users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    // limit() order: source lookup, template count check, base slug collision check.
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Public Template',
        description: '',
        items: JSON.stringify([]),
        category: '[]',
        tags: '[]',
        user_id: 'other-user',
        is_public: true,
        slug: 'public-template',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]).mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify({ visibility: 'private' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
  });
});
