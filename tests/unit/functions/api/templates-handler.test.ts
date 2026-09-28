import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

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
    select: vi.fn(),
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

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@functions/api/utils/guarded-insert')>();
  return {
    ...actual,
    // Limit-guarded inserts go through the plain insert mock so tests can inspect the row;
    // the guard itself is covered in tests/integration/plan-limits-concurrency-local-d1.test.ts.
    insertRowWhere: vi.fn((db: any, table: unknown, values: unknown) => db.insert(table).values(values)),
  };
});

import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';
import { handleTemplates } from '@functions/api/handlers/templates';
import { reconcileRunSections } from '@functions/api/utils/template-reconciliation';
import { getSessionUserId } from '@functions/api/utils/session';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';

function collectSqlColumnNames(value: unknown, seen = new Set<unknown>()): string[] {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return [];
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const names = typeof record.name === 'string' ? [record.name] : [];
  const chunks = Array.isArray(record.queryChunks) ? record.queryChunks : [];

  return [
    ...names,
    ...chunks.flatMap((chunk) => collectSqlColumnNames(chunk, seen)),
  ];
}

function collectSqlParamValues(value: unknown, seen = new Set<unknown>()): unknown[] {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return [];
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const own = 'encoder' in record && 'value' in record ? [record.value] : [];
  const chunks = Array.isArray(record.queryChunks) ? record.queryChunks : [];

  return [...own, ...chunks.flatMap((chunk) => collectSqlParamValues(chunk, seen))];
}

// Migrations 0002 and 0005 backfilled slugs from titles without stripping
// punctuation, so older rows can hold slugs today's slug rule rejects.
const legacySlugTemplate = () => ({
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
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
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

  describe('template read responses', () => {
    const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Check DNS' }] }];
    const row = (items: string) => ({
      id: 'template-1',
      title: 'Plan',
      items,
      category: '[]',
      tags: '[]',
      user_id: 'user-123',
      owner_type: 'user',
      team_id: null,
      is_public: 1,
      slug: 'plan',
    });
    const membership = { id: 'member-1', team_id: 'org-1', user_id: 'user-123', role: 'viewer', status: 'active' };
    const readRoutes: Array<[string, string, 'list' | 'organization-list' | 'detail']> = [
      ['the public catalog', '/api/templates?scope=public', 'list'],
      ['Personal templates', '/api/templates?scope=personal', 'list'],
      ['the unscoped list', '/api/templates', 'list'],
      ['Organization templates', '/api/templates?teamId=org-1', 'organization-list'],
      ['a Public Profile', '/api/templates/public?userId=user-123', 'list'],
      ['archived Personal templates', '/api/templates/archived', 'list'],
      ['archived Organization templates', '/api/templates/archived?teamId=org-1', 'organization-list'],
      ['a template by slug', '/api/templates/slug/plan', 'detail'],
      ['a template by id', '/api/templates/template-1', 'detail'],
    ];
    const read = async (path: string, kind: string, items: string) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      if (kind === 'organization-list') dbMocks.selectChain.limit.mockResolvedValueOnce([membership]);
      if (kind === 'detail') dbMocks.selectChain.limit.mockResolvedValueOnce([row(items)]);
      else dbMocks.selectChain.orderBy.mockResolvedValueOnce([row(items)]);
      const response = await handleTemplates(new Request(`http://localhost${path}`), mockEnv);
      expect(response.status).toBe(200);
      const data = await response.json();
      return Array.isArray(data) ? data[0] : data;
    };

    it.each(readRoutes)('%s sends parsed sections without the raw items column', async (_label, path, kind) => {
      const template = await read(path, kind, JSON.stringify(sections));

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual(sections);
    });

    it('still wraps a legacy flat row into sections', async () => {
      const template = await read('/api/templates/template-1', 'detail', JSON.stringify([{ id: 'i1', title: 'Check DNS' }]));

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual([{ id: '1', title: 'Checklist', items: [{ id: 'i1', title: 'Check DNS' }] }]);
    });

    it('sends empty sections, not the raw column, for a row that does not parse', async () => {
      const template = await read('/api/templates/template-1', 'detail', '{not json');

      expect(template).not.toHaveProperty('items');
      expect(template.sections).toEqual([]);
    });
  });

  it('should scope authenticated template lists to public or personal-owned templates', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const predicate = dbMocks.selectChain.where.mock.calls[0][0];
    const columnNames = collectSqlColumnNames(predicate);

    expect(response.status).toBe(200);
    expect(columnNames).toContain('is_public');
    expect(columnNames).toContain('owner_type');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('team_id');
    expect(columnNames).toContain('deleted_at');
  });

  it('should scope public profile template lists to personal-owned public templates', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([]);

    const request = new Request('http://localhost/api/templates/public?userId=user-123', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const predicate = dbMocks.selectChain.where.mock.calls[0][0];
    const columnNames = collectSqlColumnNames(predicate);

    expect(response.status).toBe(200);
    expect(columnNames).toContain('owner_type');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('team_id');
    expect(columnNames).toContain('is_public');
    expect(columnNames).toContain('deleted_at');
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
    const personalLimitPredicate = dbMocks.selectChain.where.mock.calls[0][0];
    const personalLimitColumns = collectSqlColumnNames(personalLimitPredicate);
    expect(Array.isArray(storedItems)).toBe(true);
    expect(storedItems[0].items).toHaveLength(1);
    expect(inserted.version).toBe(1);
    // A new template's last activity is its creation, so "Most Recent" can sort it.
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
    const data = await response.json();

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

  it('should list team templates for active team members', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Team Template',
        items: JSON.stringify([{ id: 'section-1', title: 'Checklist', items: [] }]),
        user_id: 'creator-1',
        owner_type: 'team',
        team_id: 'team-1',
        is_public: 0,
      },
    ]);

    const request = new Request('http://localhost/api/templates?teamId=team-1', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].id).toBe('template-1');
    expect(data[0].team_id).toBe('team-1');
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

  it('names the invalid field in template payload errors', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    // Bounds apply to changed fields only, so the stored row is read first.
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', items: '[]', version: 1, is_public: false },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ seoDescription: 'x'.repeat(321), expected_version: 1 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('seoDescription');
    expect(data.details).toEqual(expect.objectContaining({ field: 'seoDescription' }));
  });

  it('keeps a suffixed slug within the slug limit when the title slug is taken', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([]) // template count
      .mockResolvedValueOnce([{ id: 'other-template' }]) // base slug taken
      .mockResolvedValueOnce([]); // suffixed slug free

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

  // The editor shows the slug the template has after a save; it must not guess.
  it('returns the suffixed slug it stored when the requested slug is taken', async () => {
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
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe('moving-checklist-1a2b3c4d');
    expect(dbMocks.updateChain.set.mock.calls[0][0].slug).toBe(data.slug);
  });

  it('returns the slug the template keeps when a save requests none', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, items: '[]', version: 1, is_public: false, slug: 'existing-template' },
    ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Edited', expected_version: 1 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe('existing-template');
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('slug');
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
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('content_version');
  });

  it('should reconcile active private runs without losing completion or notes', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        user_id: 'user-123',
        title: 'Existing Template',
        description: '',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Keep me' }],
          },
        ]),
        version: 1,
        is_public: false,
        slug: 'existing-template',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'run-1',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        title: 'Active run',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: true, notes: 'Keep me' }],
          },
        ]),
        retired_items: '[]',
        status: 'in_progress',
        is_public: false,
        revision: 4,
      },
      {
        id: 'run-2',
        user_id: 'user-123',
        team_id: null,
        template_id: 'template-1',
        title: 'Second active run',
        items: JSON.stringify([
          {
            id: 'section-1',
            title: 'Old checklist',
            items: [{ id: 'item-1', title: 'Old title', isCompleted: false, notes: 'Different progress' }],
          },
        ]),
        retired_items: '[]',
        status: 'in_progress',
        is_public: false,
        revision: 8,
      },
      {
        id: 'completed-run',
        template_id: 'template-1',
        items: '[]',
        status: 'completed',
        is_public: false,
        deleted_at: null,
        revision: 2,
      },
      {
        id: 'archived-run',
        template_id: 'template-1',
        items: '[]',
        status: 'in_progress',
        is_public: false,
        deleted_at: '2026-09-01T00:00:00Z',
        revision: 3,
      },
      {
        id: 'shared-run',
        template_id: 'template-1',
        items: '[]',
        status: 'in_progress',
        is_public: true,
        deleted_at: null,
        revision: 4,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({
        sections: [
          {
            id: 'section-1',
            title: 'Checklist',
            items: [{
              id: 'item-1',
              title: 'Start with the renamed project',
              contents: [],
            }, {
              id: 'item-2',
              title: 'New requirement',
            }],
          },
        ],
        expected_version: 1,
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(3);
    const runUpdate = dbMocks.updateChain.set.mock.calls[1][0];
    const reconciledItems = JSON.parse(runUpdate.items);
    expect(reconciledItems[0].items).toEqual([
      expect.objectContaining({
        id: 'item-1',
        title: 'Start with the renamed project',
        isCompleted: true,
        notes: 'Keep me',
      }),
      expect.objectContaining({ id: 'item-2', isCompleted: false }),
    ]);
    expect(runUpdate).toEqual(expect.objectContaining({
      progress: 50,
      template_version: 2,
      revision: 5,
    }));
    const secondRunUpdate = dbMocks.updateChain.set.mock.calls[2][0];
    expect(secondRunUpdate).toEqual(expect.objectContaining({
      progress: 0,
      template_version: 2,
      revision: 9,
    }));
    expect(JSON.parse(secondRunUpdate.items)[0].items[0]).toEqual(expect.objectContaining({
      id: 'item-1',
      isCompleted: false,
      notes: 'Different progress',
    }));
    expect(dbMocks.updateChain.set.mock.calls).toHaveLength(3);

    const lifecyclePredicate = dbMocks.selectChain.where.mock.calls.at(-1)?.[0];
    const predicateColumns = collectSqlColumnNames(lifecyclePredicate);
    expect(predicateColumns).toContain('status');
    expect(predicateColumns).toContain('is_public');
    expect(predicateColumns).toContain('deleted_at');
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
    const data = await response.json();

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
    const data = await response.json();

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
    // The guarded audit and version inserts and the update all miss: nothing was written.
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Concurrent edit', expected_version: 3 }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe('edit_conflict');
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

  it('should return template history for active team members', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy
      .mockReturnValueOnce(dbMocks.selectChain)
      .mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: 'template-1',
          title: 'Team Template',
          description: '',
          items: '[]',
          version: 2,
          user_id: 'creator-1',
          owner_type: 'team',
          team_id: 'team-1',
          is_public: false,
          slug: 'team-template',
          created_at: new Date().toISOString(),
          updated_at: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'version-2',
          version: 2,
          changed_by_user_id: 'user-123',
          subject_type: 'team',
          subject_id: 'team-1',
          content_hash: 'hash-2',
          change_summary: 'template.updated',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'audit-2',
          actor_user_id: 'user-123',
          action: 'template.updated',
          metadata_json: '{"visibility":"public"}',
          request_id: 'req-2',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_email: 'editor@example.com',
          actor_name: 'Editor Example',
          actor_username: 'editor',
        },
      ]);

    const request = new Request('http://localhost/api/templates/template-1/history?limit=8', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.subject).toEqual({ type: 'team', id: 'team-1' });
    expect(data.versions[0]).toEqual(
      expect.objectContaining({
        action: 'template.updated',
        version: 2,
        actor: expect.objectContaining({ name: 'Editor Example' }),
      }),
    );
    // Events come with the versions: a Share's event labels its version in the Changelog,
    // and archive and restore record only an event.
    expect(data.events).toEqual([
      expect.objectContaining({ id: 'audit-2', action: 'template.updated', metadata: { visibility: 'public' } }),
    ]);
    expect(dbMocks.selectChain.limit).toHaveBeenCalledTimes(4);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(3, 8);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(4, 8);
    // Ordering by version lets the unique (template_id, version) index stop at LIMIT.
    const versionOrder = collectSqlColumnNames(dbMocks.selectChain.orderBy.mock.calls[0][0]);
    expect(versionOrder).toContain('version');
    expect(versionOrder).not.toContain('created_at');
  });

  it('returns audit events without diffs, also for templates that have no versions', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.orderBy
      .mockReturnValueOnce(dbMocks.selectChain)
      .mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-1', title: 'Legacy', items: '[]', version: 1, user_id: 'user-123', owner_type: 'user', team_id: null, is_public: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'audit-1',
          actor_user_id: 'user-123',
          action: 'template.updated',
          diff_json: JSON.stringify({ items: 'x'.repeat(200_000) }),
          metadata_json: '{"source":"test"}',
          request_id: 'req-1',
          created_at: '2026-07-03T12:00:00.000Z',
          actor_name: 'Owner',
        },
      ]);

    const response = await handleTemplates(new Request('http://localhost/api/templates/template-1/history?limit=', { method: 'GET' }), mockEnv);
    const body = await response.text();
    const data = JSON.parse(body);

    expect(response.status).toBe(200);
    expect(data.events).toEqual([expect.objectContaining({ id: 'audit-1', metadata: { source: 'test' } })]);
    expect(data.events[0]).not.toHaveProperty('diff');
    expect(body.length).toBeLessThan(2_000);
    expect(dbMocks.selectChain.limit).toHaveBeenNthCalledWith(2, 50);
  });

  it('should not expose public template history to non-owners', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Public Template',
        description: '',
        items: '[]',
        version: 1,
        user_id: 'other-user',
        owner_type: 'user',
        team_id: null,
        is_public: true,
        slug: 'public-template',
        created_at: new Date().toISOString(),
        updated_at: null,
      },
    ]);

    const request = new Request('http://localhost/api/templates/template-1/history', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(404);
  });

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

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
    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.db.batch.mock.calls[0][0]).toHaveLength(3);
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'template.imported',
        resource_type: 'template',
      }),
    );
    const importedTemplate = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values?.title === 'Imported' && 'slug' in values);
    expect(importedTemplate?.updated_at).toEqual(expect.any(String));
    expect(importedTemplate?.updated_at).toBe(importedTemplate?.created_at);
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

  it('should reject imported templates whose sections, tasks or sub-tasks are not objects', async () => {
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
          { title: 'Text tasks', sections: [{ id: 's-1', title: 'Shop', items: ['Milk', 'Eggs'] }] },
          { title: 'Flat text tasks', items: ['Milk'] },
          { title: 'Null task', sections: [{ id: 's-1', title: 'Shop', items: [{ id: 'i-1', title: 'Milk' }, null] }] },
          { title: 'Text section', sections: [{ id: 's-1', title: 'Shop', items: [] }, 'Bakery'] },
          {
            title: 'Text sub-task',
            sections: [{
              id: 's-1',
              title: 'Shop',
              items: [{ id: 'i-1', title: 'Dairy', contents: [{ id: 'c-1', type: 'subItems', value: '', subItems: ['Milk'] }] }],
            }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('template_import_failed');
    expect(data.details.imported).toBe(0);
    expect(data.details.failed).toEqual([
      expect.objectContaining({ index: 0, code: 'invalid_sections', reason: expect.stringMatching(/task 1 in section 1/i) }),
      expect.objectContaining({ index: 1, code: 'invalid_sections', reason: expect.stringMatching(/task 1 in section 1/i) }),
      expect.objectContaining({ index: 2, code: 'invalid_sections', reason: expect.stringMatching(/task 2 in section 1/i) }),
      expect.objectContaining({ index: 3, code: 'invalid_sections', reason: expect.stringMatching(/section 2/i) }),
      expect.objectContaining({ index: 4, code: 'invalid_sections', reason: expect.stringMatching(/sub-task 1 of task 1 in section 1/i) }),
    ]);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
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

  describe('malformed checklist content', () => {
    const sectionsWith = (content: unknown) => [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', contents: [content] }] }];
    const malformed: Array<[string, unknown, string]> = [
      ['a string Sub-task list', { type: 'subItems', value: '', subItems: 'x' }, 'sections[0].items[0].contents[0].subItems'],
      ['an object Sub-task list', { type: 'subItems', value: '', subItems: {} }, 'sections[0].items[0].contents[0].subItems'],
      ['an object value', { type: 'text', value: {} }, 'sections[0].items[0].contents[0].value'],
      ['an unknown type', { type: 'poll', value: 'x' }, 'sections[0].items[0].contents[0].type'],
    ];

    it.each(malformed)('POST rejects %s, naming the field, and stores nothing', async (_label, content, path) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValue([]);

      const response = await handleTemplates(new Request('http://localhost/api/templates', {
        method: 'POST',
        body: JSON.stringify({ title: 'Launch plan', sections: sectionsWith(content) }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.startsWith(`${path}: `)).toBe(true);
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it.each(malformed)('PUT rejects %s before any template or run is written', async (_label, content, path) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ sections: sectionsWith(content), expected_version: 1 }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.startsWith(`${path}: `)).toBe(true);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('still accepts a title-only save of a template whose stored content is malformed', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([{
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'Old title',
        items: JSON.stringify(sectionsWith({ type: 'subItems', value: '', subItems: 'x' })),
        version: 1,
        content_version: 1,
        slug: 'old-title',
      }]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ title: 'New title', expected_version: 1 }),
      }), mockEnv);

      expect(response.status).toBe(200);
    });

    it('fails only the imported template with malformed content, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
      dbMocks.selectChain.limit.mockResolvedValue([]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/backup', {
        method: 'POST',
        body: JSON.stringify({ templates: [
          { title: 'Broken', sections: sectionsWith({ type: 'subItems', value: '', subItems: 'x' }) },
          { title: 'Fine', sections: sectionsWith({ type: 'subItems', value: '', subItems: [{ title: 'Short' }] }) },
        ] }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.imported).toBe(1);
      expect(data.failed).toEqual([expect.objectContaining({
        title: 'Broken',
        code: 'invalid_sections',
        reason: 'sections[0].items[0].contents[0].subItems: Expected array, received string',
      })]);
    });
  });

  it('reports a failed template insert with a readable reason, not the database error', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.db.batch.mockRejectedValue(new Error('D1_ERROR: string or blob too big: SQLITE_TOOBIG'));

    const response = await handleTemplates(new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({ templates: [{ title: 'Huge', sections: [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T' }] }] }] }),
    }), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.details.failed).toEqual([expect.objectContaining({
      title: 'Huge',
      code: 'insert_failed',
      reason: 'Could not save this template. Try importing it again.',
    })]);
    expect(JSON.stringify(data)).not.toContain('SQLITE');
  });

  describe('copying a public template', () => {
    const publicSource = {
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
    };
    const editor = { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'editor', status: 'active' };
    const clone = (body: Record<string, unknown>) => handleTemplates(new Request('http://localhost/api/templates/template-1/clone', {
      method: 'POST',
      body: JSON.stringify(body),
    }), mockEnv);

    // A rejected copy leaves its queued reads unused; drop them so they cannot leak into later tests.
    afterEach(() => {
      dbMocks.selectChain.limit.mockReset();
    });

    it.each([
      ['a Free user', { plan: 'free' as const, source: 'free' as const }],
      ['a user whose Personal override is not Pro', { plan: 'free' as const, source: 'user_override' as const }],
    ])('asks %s to upgrade before copying into Personal, and reads or writes nothing', async (_label, entitlement) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ ...entitlement, limits: { maxTemplates: 1, maxActiveRuns: 3 } });
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([publicSource]);

      const response = await clone({ visibility: 'private' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('upgrade_required');
      expect(dbMocks.selectChain.limit).not.toHaveBeenCalled();
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('lets a Free user copy into a Free Organization they edit while it is under its limit', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([editor])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([publicSource])
        .mockResolvedValueOnce([]);

      const response = await clone({ visibility: 'private', teamId: 'team-1' });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBeDefined();
      expect(vi.mocked(getEntitlementsForUser)).not.toHaveBeenCalled();
      expect(dbMocks.insertChain.values.mock.calls[0][0]).toEqual(expect.objectContaining({ owner_type: 'team', team_id: 'team-1' }));
    });

    it('stops a copy into a Free Organization at its template limit', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([editor]).mockResolvedValueOnce([{ count: 1 }]);

      const response = await clone({ visibility: 'private', teamId: 'team-1' });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe('limit_reached');
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('starts the copy at version 1, keeping the source counters only as provenance', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ ...publicSource, version: 37, content_version: 12 }]).mockResolvedValueOnce([]);

      const response = await clone({ visibility: 'private' });

      expect(response.status).toBe(200);
      const inserted = dbMocks.insertChain.values.mock.calls.map(([values]) => values);
      const templateRow = inserted.find((values) => 'owner_type' in values);
      const versionRow = inserted.find((values) => 'snapshot_json' in values);
      const auditRow = inserted.find((values) => values.action === 'template.cloned');
      expect(templateRow).toEqual(expect.objectContaining({ version: 1, content_version: 1 }));
      expect(versionRow).toEqual(expect.objectContaining({ version: 1, change_summary: 'template.cloned' }));
      expect(JSON.parse(versionRow.snapshot_json)).toEqual(expect.objectContaining({ version: 1, content_version: 1 }));
      expect(JSON.parse(auditRow.metadata_json)).toEqual({ sourceTemplateId: 'template-1', sourceVersion: 37, sourceContentVersion: 12 });
    });
  });

  it('should clone a public template for pro users', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
    // limit() order: source lookup, base slug collision check (Pro has no template count check).
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
    const clonedTemplate = dbMocks.insertChain.values.mock.calls
      .map(([values]) => values)
      .find((values) => values?.id === data.id && 'slug' in values);
    expect(clonedTemplate?.updated_at).toEqual(expect.any(String));
    expect(clonedTemplate?.updated_at).toBe(clonedTemplate?.created_at);
  });

  describe('template saves that resend unchanged sections', () => {
    const storedSections = [
      {
        id: 'section-1',
        title: 'Launch',
        items: [
          {
            id: 'item-1',
            title: 'Write copy',
            description: 'Draft it',
            contents: [{ id: 'content-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] }],
          },
          { id: 'item-2', title: 'Publish' },
        ],
      },
    ];
    // The editor's copy of storedSections: other key order, injected run state, empty defaults.
    const editorSections = [
      {
        title: 'Launch',
        id: 'section-1',
        items: [
          {
            isCompleted: false,
            contents: [{ value: '', type: 'subItems', id: 'content-1', subItems: [{ title: 'Short', id: 'sub-1', isCompleted: false }] }],
            description: 'Draft it',
            title: 'Write copy',
            id: 'item-1',
          },
          { id: 'item-2', title: 'Publish', description: '', contents: [], isCompleted: false, completed: false },
        ],
      },
    ];
    const storedTemplate = {
      id: 'template-1',
      user_id: 'user-123',
      owner_type: 'user',
      team_id: null,
      title: 'Launch plan',
      description: 'Ship it',
      type: 'checklist',
      seo_title: '',
      seo_description: '',
      items: JSON.stringify(storedSections),
      category: '[]',
      tags: '["launch"]',
      slug: 'launch-plan',
      version: 3,
      content_version: 2,
      is_public: false,
    };
    // Everything the editor sends on Save, matching storedTemplate.
    const editorPayload = {
      title: 'Launch plan',
      description: 'Ship it',
      type: 'checklist',
      seoTitle: '',
      seoDescription: '',
      sections: editorSections,
      categories: [],
      tags: ['launch'],
      is_public: false,
      slug: 'launch-plan',
      expected_version: 3,
    };
    const put = (body: unknown) => handleTemplates(new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify(body),
    }), mockEnv);
    const versionInserts = () => dbMocks.insertChain.values.mock.calls.filter(([values]) => 'snapshot_json' in values);

    beforeEach(() => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([storedTemplate]);
    });

    it('saves metadata edits without bumping content_version or rewriting runs', async () => {
      const response = await put({ ...editorPayload, title: 'Launch plan v2', description: 'Ship it well', is_public: true });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ success: true, structureChanged: false, reconciledRuns: 0, content_version: 2, version: 4 }));
      expect(dbMocks.updateChain.set).toHaveBeenCalledTimes(1);
      const templateUpdate = dbMocks.updateChain.set.mock.calls[0][0];
      expect(templateUpdate).toEqual(expect.objectContaining({ title: 'Launch plan v2', description: 'Ship it well', is_public: true, version: 4 }));
      expect(templateUpdate).not.toHaveProperty('content_version');
      expect(templateUpdate).not.toHaveProperty('items');
      expect(templateUpdate).not.toHaveProperty('slug');
      expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
      expect(versionInserts()).toHaveLength(1);
    });

    it('versions a visibility change, so a stale editor gets a conflict, without touching content or runs', async () => {
      const response = await put({ is_public: true, expected_version: 3 });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ version: 4, content_version: 2, structureChanged: false, reconciledRuns: 0 }));
      const templateUpdate = dbMocks.updateChain.set.mock.calls[0][0];
      expect(templateUpdate).toEqual(expect.objectContaining({ is_public: true, version: 4 }));
      expect(templateUpdate).not.toHaveProperty('content_version');
      expect(versionInserts()).toHaveLength(1);
      expect(versionInserts()[0][0]).toEqual(expect.objectContaining({ version: 4 }));
      expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
    });

    it('rejects an editor save made before a visibility change', async () => {
      dbMocks.selectChain.limit.mockReset();
      dbMocks.selectChain.limit.mockResolvedValue([]);
      dbMocks.selectChain.limit.mockResolvedValueOnce([{ ...storedTemplate, is_public: true, version: 4 }]);

      const response = await put({ ...editorPayload, title: 'Launch plan (typo fixed)', is_public: false, expected_version: 3 });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.code).toBe('edit_conflict');
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('does not version a resent, unchanged visibility', async () => {
      const response = await put({ is_public: false, expected_version: 3 });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ version: 3 }));
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('accepts a save with no changes without writing anything', async () => {
      const response = await put(editorPayload);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ success: true, version: 3, content_version: 2, structureChanged: false }));
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('still reconciles active runs when the checklist structure changes', async () => {
      const reordered = JSON.parse(JSON.stringify(editorSections));
      reordered[0].items.reverse();
      dbMocks.selectChain.orderBy.mockResolvedValueOnce([
        { id: 'run-1', items: JSON.stringify(storedSections), retired_items: '[]', status: 'in_progress', is_public: false, revision: 1 },
      ]);

      const response = await put({ ...editorPayload, sections: reordered });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ structureChanged: true, reconciledRuns: 1, content_version: 3, version: 4 }));
      expect(dbMocks.updateChain.set.mock.calls[0][0]).toEqual(expect.objectContaining({ content_version: 3, version: 4 }));
      expect(JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].items)[0].items.map((item: { id: string }) => item.id))
        .toEqual(['item-2', 'item-1']);
      expect(dbMocks.updateChain.set.mock.calls[1][0]).toEqual(expect.objectContaining({ template_version: 3, revision: 2 }));
    });
    it('records a reconciled event on each run whose work changed, naming what it retired', async () => {
      const withoutPublish = editorSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== 'item-2'),
      }));
      const annotatedRun = JSON.parse(JSON.stringify(storedSections));
      annotatedRun[0].items[1] = { ...annotatedRun[0].items[1], isCompleted: true, notes: 'Registrar login is in vault X' };
      // A run that already matches the new structure has nothing to record.
      const unaffectedRun = reconcileRunSections(storedSections, withoutPublish, []).sections;
      dbMocks.selectChain.orderBy.mockResolvedValueOnce([
        { id: 'run-1', items: JSON.stringify(annotatedRun), retired_items: '[]', status: 'in_progress', is_public: false, revision: 4 },
        { id: 'run-2', items: JSON.stringify(unaffectedRun), retired_items: '[]', status: 'in_progress', is_public: false, revision: 2 },
      ]);
      const changed = { meta: { changes: 1 } };
      dbMocks.db.batch.mockResolvedValueOnce([changed, changed, changed, changed, changed, { meta: { changes: 0 } }]);

      const response = await put({ ...editorPayload, sections: withoutPublish });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reconciledRuns).toBe(1);
      const dialect = new SQLiteSyncDialect();
      const guardedInserts = dbMocks.insertChain.select.mock.calls.map(([query]) => dialect.sqlToQuery(query as SQL));
      expect(guardedInserts).toHaveLength(1);
      const { sql: insertSql, params } = guardedInserts[0];
      expect(params).toEqual(expect.arrayContaining(['checklist_run.reconciled', 'run-1', 'user-123']));
      const metadata = JSON.parse(params.find((param) => typeof param === 'string' && param.includes('"retired"')) as string);
      expect(metadata).toEqual(expect.objectContaining({
        templateId: 'template-1',
        templateVersion: 3,
        fromRevision: 4,
        toRevision: 5,
        retired: [{ kind: 'item', id: 'item-2', title: 'Publish' }],
      }));
      // The event names the retired work; the notes stay in the run's retired_items only.
      expect(JSON.stringify(params)).not.toContain('vault X');
      // Guarded by the run update's own WHERE clause, so a missed update records nothing.
      expect(insertSql).toMatch(/where exists \(select 1 from "checklist_runs" where .*"checklist_runs"\."revision" = \?/);
      expect(params).toContain(4);
      const statements = dbMocks.db.batch.mock.calls[0][0];
      expect(statements).toHaveLength(6);
      expect(statements[3]).toEqual({ kind: 'conditional-insert' });
      expect(statements[4]).toBe(dbMocks.updateChain);
      expect(JSON.parse(dbMocks.updateChain.set.mock.calls[1][0].retired_items)).toEqual([
        expect.objectContaining({ kind: 'item', item: expect.objectContaining({ id: 'item-2', notes: 'Registrar login is in vault X' }) }),
      ]);
    });
  });

  describe('rows that every later save must be able to resend', () => {
    const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const proUser = () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    };

    it.each([
      ['a 155-character title', 'a'.repeat(155)],
      ['a 160-character title ending near a word break', `${'word '.repeat(31)}tail`],
      ['a 300-character title', 'Checklist '.repeat(30)],
    ])('keeps a colliding clone slug within 160 characters for %s', async (_label, title) => {
      proUser();
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{ id: 'template-1', title, items: '[]', category: '[]', tags: '[]', user_id: 'other-user', is_public: true, slug: 'source', version: 1 }])
        .mockResolvedValueOnce([{ id: 'template-1' }])
        .mockResolvedValueOnce([]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1/clone', {
        method: 'POST',
        body: JSON.stringify({ visibility: 'private' }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.slug.length).toBeLessThanOrEqual(160);
      expect(data.slug).toMatch(SLUG_PATTERN);
    });

    it('accepts a save that resends a legacy slug and stored values that predate the bounds', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      const legacy = {
        id: 'template-1',
        user_id: 'user-123',
        owner_type: 'user',
        team_id: null,
        title: 'T'.repeat(170),
        description: 'd'.repeat(6000),
        seo_description: 's'.repeat(400),
        rules: JSON.stringify([{ id: '', type: 'required-field', path: 'title', severity: 'error' }]),
        items: '[]',
        category: '[]',
        tags: '[]',
        slug: 'seo-checklist:-2024',
        version: 2,
        content_version: 1,
        is_public: false,
      };
      dbMocks.selectChain.limit.mockResolvedValueOnce([legacy]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({
          title: legacy.title,
          description: legacy.description,
          seoDescription: legacy.seo_description,
          rules: [{ id: '', type: 'required-field', path: 'title', severity: 'error' }],
          slug: legacy.slug,
          is_public: true,
          expected_version: 2,
        }),
      }), mockEnv);

      expect(response.status).toBe(200);
      const templateUpdate = dbMocks.updateChain.set.mock.calls[0][0];
      expect(templateUpdate).toEqual(expect.objectContaining({ is_public: true }));
      expect(templateUpdate).not.toHaveProperty('slug');
      expect(templateUpdate).not.toHaveProperty('description');
    });

    it('rejects a changed value over its bound and names the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        { id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', description: '', items: '[]', version: 1, is_public: false },
      ]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ description: 'd'.repeat(5001), expected_version: 1 }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/^description: /);
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    });

    it('keeps a suffixed slug within 160 characters when the requested slug is taken', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{ id: 'template-1', user_id: 'user-123', owner_type: 'user', team_id: null, title: 'Plan', items: '[]', slug: 'plan', version: 1, is_public: false }])
        .mockResolvedValueOnce([{ id: 'template-2' }]);

      const response = await handleTemplates(new Request('http://localhost/api/templates/template-1', {
        method: 'PUT',
        body: JSON.stringify({ slug: 'b'.repeat(160), expected_version: 1 }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.slug.length).toBeLessThanOrEqual(160);
      expect(data.slug).toMatch(SLUG_PATTERN);
    });

    it('fails only the imported templates whose fields exceed the bounds, naming the field', async () => {
      proUser();
      const sections = [{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }];

      const response = await handleTemplates(new Request('http://localhost/api/templates/backup', {
        method: 'POST',
        body: JSON.stringify({
          templates: [
            { title: 'Valid', sections },
            { title: 'x'.repeat(161), sections },
            { title: 'Long description', description: 'd'.repeat(5001), sections },
            { title: 'Blank rule', rules: [{ id: '', type: 'required-field', path: 'title' }], sections },
            { title: '   ', sections },
          ],
        }),
      }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.imported).toBe(1);
      expect(data.failed.map((failure: { index: number; code: string; reason: string }) => [failure.index, failure.code, failure.reason.split(':')[0]]))
        .toEqual([[1, 'invalid_fields', 'title'], [2, 'invalid_fields', 'description'], [3, 'invalid_fields', 'rules.0.id'], [4, 'invalid_fields', 'title']]);
    });
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
      const data = await response.json();

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
      const data = await response.json();

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
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toMatch(/^slug: /);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });
  });

  it('saves a template whose stored legacy slug is echoed back unchanged', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([legacySlugTemplate()]);

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
    dbMocks.selectChain.limit.mockResolvedValueOnce([legacySlugTemplate()]);

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
    dbMocks.selectChain.limit.mockResolvedValueOnce([legacySlugTemplate()]);

    const request = new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Launch plan', slug: '?!?' }),
    });

    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/^slug: /);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it('rejects a PUT whose only field is the unchanged slug', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    dbMocks.selectChain.limit.mockResolvedValueOnce([legacySlugTemplate()]);

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
      { ...legacySlugTemplate(), is_public: 1, owner_username: 'owner' },
    ]);

    const request = new Request(
      `http://localhost/api/templates/slug/${encodeURIComponent('qanda:-launch-plan-1a2b3c4d')}`,
      { method: 'GET' },
    );
    const response = await handleTemplates(request, mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe('qanda:-launch-plan-1a2b3c4d');
    const whereArg = dbMocks.selectChain.where.mock.calls[0][0];
    expect(collectSqlParamValues(whereArg)).toContain('qanda:-launch-plan-1a2b3c4d');
  });

  it('answers a malformed percent-encoded slug with 404', async () => {
    const request = new Request('http://localhost/api/templates/slug/%E0%A4%A', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.selectChain.limit).not.toHaveBeenCalled();
  });
});
