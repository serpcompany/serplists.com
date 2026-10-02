import { createEdgeCache, SECRET_THE_API_ROUTER_VALIDATES, serveTheSiteFrom, serverContext, unreachableD1 } from '../../../support/mockedServerContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from '@/app/(site)/categories/[categorySlug]/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import { loadCategoryPageSeo } from '@/server/pageMeta/categoryPage';
import { SqliteD1 } from '../../../support/sqlite-d1';

let d1: SqliteD1;

const addPublicTemplate = (id: string, categories: string[], ownerUsername: string | null = 'alice') => {
  d1.run(
    `INSERT OR IGNORE INTO users (id, email, name, username, email_verified, created_at, updated_at)
     VALUES (?, ?, 'Owner', ?, 1, '2026-01-01', '2026-01-01')`,
    `owner-${ownerUsername ?? id}`,
    `${ownerUsername ?? id}@example.test`,
    ownerUsername,
  );
  d1.run(
    `INSERT INTO templates (id, user_id, title, items, slug, is_public, created_at, owner_type, category)
     VALUES (?, ?, ?, '[]', ?, 1, '2026-02-01', 'user', ?)`,
    id,
    `owner-${ownerUsername ?? id}`,
    `Template ${id}`,
    id,
    JSON.stringify(categories),
  );
};

const params = (categorySlug: string) => ({ params: Promise.resolve({ categorySlug }) });

beforeEach(() => {
  d1 = new SqliteD1();
  serveTheSiteFrom(d1);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('category page metadata', () => {
  it('names a built-in category with its public template count and canonical URL', async () => {
    addPublicTemplate('code-review', ['Engineering']);

    const metadata = await generateMetadata(params('engineering'));

    expect(metadata.title).toEqual({ absolute: `Engineering & Development Templates | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe(
      '1 template for Engineering & Development. Checklists for code reviews, deployments, and development workflows',
    );
    expect(metadata.alternates?.canonical).toBe('https://serplists.com/categories/engineering/');
    expect(metadata.robots).toBe('index, follow');
  });

  it('points another spelling of the slug at the category’s own URL', async () => {
    addPublicTemplate('code-review', ['Engineering']);

    const metadata = await generateMetadata(params('ENGINEERING'));

    expect(metadata.alternates?.canonical).toBe('https://serplists.com/categories/engineering/');
  });

  it('keeps a built-in category that no public template uses yet out of search', async () => {
    const metadata = await generateMetadata(params('compliance'));

    expect(metadata.robots).toBe('noindex, follow');
    expect(metadata.description).toMatch(/^0 templates for Compliance & Legal\./);
  });

  it('names a category that only database templates use, from the catalog', async () => {
    addPublicTemplate('moving-day', ['Moving Day']);

    const metadata = await generateMetadata(params('moving-day'));

    expect(metadata.title).toEqual({ absolute: `Moving Day Templates | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe('1 template for Moving Day. Templates filed under Moving Day.');
  });

  it('counts the bundled library, which the API does not serve', async () => {
    const result = await loadCategoryPageSeo('outdoor');

    expect(result?.title).toBe('outdoor Templates');
    expect(result?.robots).toBeUndefined();
  });

  it('counts only templates the library can link to (the owner has a username)', async () => {
    addPublicTemplate('no-owner-url', ['Moving Day'], null);

    expect(await loadCategoryPageSeo('moving-day')).toBeNull();
  });

  it('keeps the site defaults for a category nothing uses, and lets the page decide', async () => {
    expect(await loadCategoryPageSeo('not-a-real-category')).toBeNull();
    expect(await generateMetadata(params('not-a-real-category'))).toEqual({});
  });
});

describe('category page metadata when the catalog cannot be read', () => {
  beforeEach(() => {
    serverContext.env = { DB: unreachableD1, BETTER_AUTH_SECRET: SECRET_THE_API_ROUTER_VALIDATES };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('still names a built-in category, without a count, and keeps it indexable', async () => {
    const metadata = await generateMetadata(params('engineering'));

    expect(metadata.title).toEqual({ absolute: `Engineering & Development Templates | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe(
      'Templates for Engineering & Development. Checklists for code reviews, deployments, and development workflows',
    );
    expect(metadata.robots).toBe('index, follow');
  });

  it('keeps the site defaults for a category only the catalog could name', async () => {
    expect(await generateMetadata(params('moving-day'))).toEqual({});
  });
});

describe('category page metadata cache', () => {
  it('counts the catalog once per host and 5 minutes for every category page', async () => {
    addPublicTemplate('code-review', ['Engineering']);
    const edgeCache = createEdgeCache();
    vi.stubGlobal('caches', { default: edgeCache.cache });

    await loadCategoryPageSeo('engineering');
    const queries = d1.queries.length;
    await loadCategoryPageSeo('compliance');

    expect(d1.queries.length).toBe(queries);
    const stored = edgeCache.entries.get('https://serplists.com/__page-meta/v1/categories');
    expect(stored?.headers.get('Cache-Control')).toBe('public, s-maxage=300');
  });
});
