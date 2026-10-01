import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chainSelectsUpdatesAndDeletes } from '../../../support/drizzleChainMocks';
import bundledCatalog from '../../../../functions/sitemap/bundled-catalog.generated.json';
import { repoTemplates } from '@/lib/repoTemplateCatalog';

const dbMocks = await vi.hoisted(async () => (await import('../../../support/drizzleChainMocks')).drizzleChainMocks());

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

import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const bundledSlugs = bundledCatalog.templates.map((template) => template.slug);
const titleFor = (slug: string) => slug.split('-').map((word) => word.toUpperCase()).join(' ');
const sections = [{ id: 'section-1', title: 'Checklist', items: [] }];

const mockEnv = {
  DB: {},
  BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
};

const post = (path: string, body: unknown) =>
  handleTemplates(
    new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) }),
    mockEnv as never,
  );

const expectSuffixed = (stored: unknown, slug: string) => {
  expect(stored).not.toBe(slug);
  expect(stored).toMatch(new RegExp(`^${slug}-[0-9a-z]{8}$`));
};

const existingTemplate = (slug: string) => ({
  id: 'template-1',
  user_id: 'user-123',
  title: 'Existing Template',
  description: '',
  items: '[]',
  version: 1,
  is_public: true,
  slug,
  created_at: new Date().toISOString(),
  updated_at: null,
});

const put = (slug: string, fields: Record<string, unknown> = {}) =>
  handleTemplates(
    new Request('http://localhost/api/templates/template-1', {
      method: 'PUT',
      body: JSON.stringify({ ...fields, slug, expected_version: 1 }),
    }),
    mockEnv as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.selectChain.limit.mockReset();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
  dbMocks.db.batch.mockResolvedValue([]);

  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  const unlimited = { plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } };
  vi.mocked(getEntitlementsForUser).mockResolvedValue(unlimited);
  vi.mocked(getEntitlementsForContext).mockResolvedValue(unlimited);
});

describe('bundled starter slugs are reserved against an empty D1, since bundled starters are not D1 rows', () => {
  it('covers every bundled starter Template the app shows', () => {
    expect(bundledSlugs.length).toBeGreaterThan(0);
    const appSlugs = repoTemplates.map((template) => template.slug?.trim()).filter(Boolean);
    expect(new Set(bundledSlugs)).toEqual(new Set(appSlugs));
  });

  it.each(bundledSlugs)('suffixes a requested slug of %s on create', async (slug) => {
    const response = await post('/api/templates', { title: 'My copy', slug, sections });

    expect(response.status).toBe(200);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expectSuffixed(inserted.slug, slug);
    expect((await response.json()).slug).toBe(inserted.slug);
  });

  it.each(bundledSlugs)('suffixes a title that slugifies to %s on create', async (slug) => {
    const response = await post('/api/templates', { title: titleFor(slug), sections });

    expect(response.status).toBe(200);
    expectSuffixed(dbMocks.insertChain.values.mock.calls[0][0].slug, slug);
  });

  it.each(bundledSlugs)('suffixes an imported Template titled like %s', async (slug) => {
    const response = await post('/api/templates/backup', {
      kind: 'serplists-template-pack',
      schemaVersion: '2.0.0',
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [{ title: titleFor(slug), visibility: 'public', sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }] }],
    });

    expect(response.status).toBe(200);
    expectSuffixed(dbMocks.insertChain.values.mock.calls[0][0].slug, slug);
  });

  it.each(bundledSlugs)('suffixes a clone of a public Template titled like %s', async (slug) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: 'template-1',
        title: titleFor(slug),
        description: '',
        items: '[]',
        category: '[]',
        tags: '[]',
        user_id: 'other-user',
        is_public: true,
        slug: `${slug}-deadbeef`,
        created_at: new Date().toISOString(),
        updated_at: null,
        version: 1,
      },
    ]);

    const response = await post('/api/templates/template-1/clone', { visibility: 'private' });

    expect(response.status).toBe(200);
    expectSuffixed(dbMocks.insertChain.values.mock.calls[0][0].slug, slug);
  });

  it.each(bundledSlugs)('suffixes a rename to %s', async (slug) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate('existing-template')]);

    const response = await put(slug);

    expect(response.status).toBe(200);
    expectSuffixed(dbMocks.updateChain.set.mock.calls[0][0].slug, slug);
  });

  it('keeps a slug a Template already holds, which the editor resends with every save, so saving never changes its shared URL', async () => {
    const [slug] = bundledSlugs;
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate(slug)]);

    const response = await put(slug, { title: 'Renamed Template' });

    expect(response.status).toBe(200);
    const stored = dbMocks.updateChain.set.mock.calls[0][0];
    expect(stored.title).toBe('Renamed Template');
    expect(stored).not.toHaveProperty('slug');
  });

  it('keeps ordinary slugs unsuffixed', async () => {
    const response = await post('/api/templates', { title: 'Camping checklist for families', sections });

    expect(response.status).toBe(200);
    expect(dbMocks.insertChain.values.mock.calls[0][0].slug).toBe('camping-checklist-for-families');
  });
});

describe('UUID-shaped slugs are reserved, since template pages and link previews read a UUID in their path as a template id', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const expectNotUuid = (stored: unknown) => {
    expectSuffixed(stored, uuid);
    expect(stored).not.toMatch(UUID_PATTERN);
  };

  it('suffixes a requested UUID slug on create', async () => {
    const response = await post('/api/templates', { title: 'My checklist', slug: uuid, sections });

    expect(response.status).toBe(200);
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expectNotUuid(inserted.slug);
    expect((await response.json()).slug).toBe(inserted.slug);
  });

  it.each([uuid, uuid.toUpperCase(), ` ${uuid.toUpperCase()}. `])('suffixes a Template titled %j on create', async (title) => {
    const response = await post('/api/templates', { title, sections });

    expect(response.status).toBe(200);
    expectNotUuid(dbMocks.insertChain.values.mock.calls[0][0].slug);
  });

  it('suffixes an imported Template titled with a UUID', async () => {
    const response = await post('/api/templates/backup', {
      kind: 'serplists-template-pack',
      schemaVersion: '2.0.0',
      exportedAt: '2026-03-21T00:00:00.000Z',
      templates: [{ title: uuid, visibility: 'public', sections: [{ title: 'Checklist', items: [{ title: 'Item' }] }] }],
    });

    expect(response.status).toBe(200);
    expectNotUuid(dbMocks.insertChain.values.mock.calls[0][0].slug);
  });

  it.each([uuid, uuid.toUpperCase()])('suffixes a rename to %s and returns the slug it stored', async (slug) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate('existing-template')]);

    const response = await put(slug);

    expect(response.status).toBe(200);
    const stored = dbMocks.updateChain.set.mock.calls[0][0].slug;
    expectNotUuid(stored);
    expect((await response.json()).slug).toBe(stored);
  });

  it('keeps a UUID slug a Template already holds, so saving never changes its shared URL', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([existingTemplate(uuid)]);

    const response = await put(uuid, { title: 'Renamed Template' });

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('slug');
  });
});
