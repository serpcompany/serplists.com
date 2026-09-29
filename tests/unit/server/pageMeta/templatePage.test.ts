import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata } from '@/app/(site)/profile/[username]/[templateSlug]/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import { buildPageJsonLd } from '@/lib/seo/pageMetadata';
import { loadTemplatePageSeo } from '@/server/pageMeta/templatePage';
import { createEdgeCache, failingD1, serverContext } from '../../../support/nextServerContext';
import { SqliteD1 } from '../../../support/sqlite-d1';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('../../../support/nextServerContext')).cloudflareMock);
vi.mock('next/headers', async () => (await import('../../../support/nextServerContext')).headersMock);

// /profile/<username>/<identifier> renders its own title, description, canonical URL, link
// preview and robots rule on the server, finding the template the way the page does: a
// bundled library template first, then a public template in D1 whose owner has that
// username. A missing template is kept out of search; a failed lookup, which may be brief,
// keeps the site's defaults and stays indexable.

const TEMPLATE_ID = '9b2d7c1e-0f3a-4e5b-8c6d-7a8b9c0d1e2f';

let d1: SqliteD1;

const insertTemplate = (overrides: Partial<Record<string, unknown>> = {}) => {
  const row = {
    id: TEMPLATE_ID,
    slug: 'reviewed-clipy-checklist',
    title: 'Reviewed Clipy Checklist',
    description: 'Persisted Clipy summary.',
    seo_title: 'Saved Clipy Search Title',
    seo_description: 'Saved Clipy search description with five actionable steps.',
    is_public: 1,
    deleted_at: null,
    ...overrides,
  };
  d1.run(
    `INSERT INTO templates (id, user_id, title, description, seo_title, seo_description, items, slug, is_public, deleted_at, created_at, owner_type, category)
     VALUES (?, 'user-1', ?, ?, ?, ?, '[]', ?, ?, ?, '2026-09-04', 'user', '["packing"]')`,
    row.id,
    row.title,
    row.description,
    row.seo_title,
    row.seo_description,
    row.slug,
    row.is_public,
    row.deleted_at,
  );
};

const params = (username: string, templateSlug: string) => ({
  params: Promise.resolve({ username, templateSlug }),
});

beforeEach(() => {
  d1 = new SqliteD1();
  d1.run(
    `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
     VALUES ('user-1', 'alice@example.test', 'Alice', 'alice', 1, '2026-01-01', '2026-01-01')`,
  );
  serverContext.env = { DB: d1.binding };
  serverContext.host = 'serplists.com';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('template page metadata', () => {
  it('uses the SEO title and description saved with a published template', async () => {
    insertTemplate();

    const metadata = await generateMetadata(params('alice', 'reviewed-clipy-checklist'));

    expect(metadata.title).toEqual({ absolute: `Saved Clipy Search Title | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe('Saved Clipy search description with five actionable steps.');
    expect(metadata.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-09-04' });
    expect(metadata.keywords).toEqual(['packing']);
    expect(metadata.robots).toBe('index, follow');
  });

  it('falls back to the ordinary title and description when the saved SEO fields are empty', async () => {
    insertTemplate({ seo_title: '', seo_description: '' });

    const metadata = await generateMetadata(params('alice', 'reviewed-clipy-checklist'));

    expect(metadata.title).toEqual({ absolute: `Reviewed Clipy Checklist | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe('Persisted Clipy summary.');
  });

  // Canonical links, og:url and JSON-LD name one URL per template: the stored username and
  // the slug on the production site, whatever the visit looked like. The server never sees
  // the visit's query or hash.
  it('points the canonical at the production slug URL from a visit by id, in another letter case', async () => {
    insertTemplate();

    const result = await loadTemplatePageSeo('ALICE', TEMPLATE_ID);
    const metadata = await generateMetadata(params('ALICE', TEMPLATE_ID));

    const canonical = 'https://serplists.com/profile/alice/reviewed-clipy-checklist/';
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph?.url).toBe(canonical);
    expect(result.kind === 'found' && buildPageJsonLd(result.seo).url).toBe(canonical);
  });

  it('names the production site on staging and workers.dev hosts, as the sitemap does', async () => {
    insertTemplate();

    for (const host of ['staging.serplists.com', 'serp-checklists-preview.example.workers.dev']) {
      serverContext.host = host;
      const metadata = await generateMetadata(params('alice', 'reviewed-clipy-checklist'));

      expect(metadata.alternates?.canonical).toBe('https://serplists.com/profile/alice/reviewed-clipy-checklist/');
      expect(JSON.stringify(metadata)).not.toContain(host);
    }
  });

  it('uses the template id for a template without a slug', async () => {
    insertTemplate({ slug: null });

    const metadata = await generateMetadata(params('alice', TEMPLATE_ID));

    expect(metadata.alternates?.canonical).toBe(`https://serplists.com/profile/alice/${TEMPLATE_ID}/`);
  });

  it('finds a bundled library template under the official owner, without reading D1', async () => {
    serverContext.env = { DB: failingD1 };

    const metadata = await generateMetadata(params('SERP', 'ultimate-camping-checklist'));

    expect(metadata.title).toEqual({ absolute: `Ultimate Camping Checklist | ${APP_BRAND_NAME}` });
    expect(metadata.alternates?.canonical).toBe('https://serplists.com/profile/serp/ultimate-camping-checklist/');
    expect(metadata.robots).toBe('index, follow');
  });
});

describe('template page metadata for a template that is not there', () => {
  const expectNotFound = async (username: string, identifier: string) => {
    const metadata = await generateMetadata(params(username, identifier));

    expect(metadata.robots).toBe('noindex, nofollow');
    expect(metadata.title).toEqual({ absolute: `Template not found | ${APP_BRAND_NAME}` });
    // The address is not a page, so it names no canonical URL.
    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.openGraph?.url).toBeUndefined();
  };

  it('keeps a missing template out of search', async () => {
    await expectNotFound('alice', 'no-such-template');
  });

  it('keeps another owner’s template path out of search', async () => {
    insertTemplate();

    await expectNotFound('bob', 'reviewed-clipy-checklist');
  });

  it('keeps a private or deleted template out of search', async () => {
    insertTemplate({ is_public: 0 });
    await expectNotFound('alice', 'reviewed-clipy-checklist');

    d1 = new SqliteD1();
    d1.run(
      `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
       VALUES ('user-1', 'alice@example.test', 'Alice', 'alice', 1, '2026-01-01', '2026-01-01')`,
    );
    serverContext.env = { DB: d1.binding };
    insertTemplate({ deleted_at: '2026-09-05' });
    await expectNotFound('alice', 'reviewed-clipy-checklist');
  });

  it('keeps the site defaults, indexable, when the lookup fails', async () => {
    serverContext.env = { DB: failingD1 };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist')).toEqual({ kind: 'unavailable' });
    expect(await generateMetadata(params('alice', 'reviewed-clipy-checklist'))).toEqual({});
    expect(String(logged.mock.calls[0]?.[0])).toContain('template_page_meta_failed');
  });
});

// Humans and crawlers both open template pages, so a found template is cached in the data
// center for 5 minutes (docs/design-docs/d1-cost.md), per host: staging and production share
// the zone's cache and must never read each other's entries.
describe('template page metadata cache', () => {
  it('reads D1 once per template, host and 5 minutes', async () => {
    insertTemplate();
    const edgeCache = createEdgeCache();
    vi.stubGlobal('caches', { default: edgeCache.cache });

    await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist');
    const queries = d1.queries.length;
    const again = await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist');

    expect(again.kind).toBe('found');
    expect(d1.queries.length).toBe(queries);
    const [[key, stored]] = [...edgeCache.entries];
    expect(key).toBe('https://serplists.com/__page-meta/v2/templates/reviewed-clipy-checklist');
    expect(stored.headers.get('Cache-Control')).toBe('public, s-maxage=300');

    serverContext.host = 'staging.serplists.com';
    await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist');
    expect(d1.queries.length).toBeGreaterThan(queries);
  });

  it('never caches a template that is not there', async () => {
    const edgeCache = createEdgeCache();
    vi.stubGlobal('caches', { default: edgeCache.cache });

    await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist');
    insertTemplate();

    expect((await loadTemplatePageSeo('alice', 'reviewed-clipy-checklist')).kind).toBe('found');
    expect(edgeCache.entries.size).toBe(1);
  });
});
