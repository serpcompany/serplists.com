import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
  };

  return { selectChain, insertChain, db };
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
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

describe('portable template import/export API', () => {
  const mockEnv = {
    DB: {},
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
  };

  beforeEach(() => {
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);

    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: 'pro',
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
  });

  it('exports portable template packs by default', async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: 'Template',
        description: '',
        items: JSON.stringify([{ id: 's-1', title: 'Checklist', items: [{ id: 'i-1', title: 'Item' }] }]),
        rules: JSON.stringify([
          {
            id: 'rule-1',
            type: 'required-field',
            path: 'sections[].items[].title',
            value: 'Every item needs a title',
            severity: 'error',
          },
        ]),
        category: '["seo"]',
        tags: '["tag-1"]',
        user_id: 'user-123',
        is_public: 1,
        slug: 'template',
        seo_title: 'SEO Title',
        seo_description: 'SEO Description',
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const request = new Request('http://localhost/api/templates/backup', { method: 'GET' });
    const response = await handleTemplates(request, mockEnv as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.kind).toBe('serplists-template-pack');
    expect(data.schemaVersion).toBe('2.0.0');
    expect(data.templates[0].visibility).toBe('public');
    expect(data.templates[0].seoTitle).toBe('SEO Title');
    expect(data.templates[0].seoDescription).toBe('SEO Description');
    expect(data.templates[0].rules).toHaveLength(1);
    expect(data.manifest.includesRules).toBe(true);
  });

  it('imports portable template packs', async () => {
    dbMocks.selectChain.limit.mockResolvedValue([]);

    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates: [
          {
            title: 'Imported Portable Template',
            visibility: 'public',
            seoTitle: 'Imported SEO Title',
            seoDescription: 'Imported SEO Description',
            rules: [
              {
                id: 'rule-1',
                type: 'required-field',
                path: 'sections[].items[].title',
                value: 'Every item needs a title',
                severity: 'error',
              },
            ],
            sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.imported).toBe(1);
    expect(data.successes).toEqual([
      expect.objectContaining({
        index: 0,
        title: 'Imported Portable Template',
        visibility: 'public',
      }),
    ]);

    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.is_public).toBe(true);
    expect(inserted.seo_title).toBe('Imported SEO Title');
    expect(inserted.seo_description).toBe('Imported SEO Description');
    expect(inserted.rules).toContain('required-field');
  });

  it('rejects unsupported portable schema versions', async () => {
    const request = new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '9.9.9',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates: [
          {
            title: 'Imported Portable Template',
            sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }],
          },
        ],
      }),
    });

    const response = await handleTemplates(request, mockEnv as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('unsupported_portable_schema_version');
  });
});
