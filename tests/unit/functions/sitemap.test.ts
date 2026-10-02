import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { elementAt, firstOf } from '../../support/elements';
import { validateXML } from 'xmllint-wasm';

import * as legacyCategoriesSitemapRoute from '@/app/(site)/categories/sitemap.xml/route';
import * as pagesSitemapRoute from '@/app/sitemaps/pages/[page]/route';
import * as legacyStaticSitemapRoute from '@/app/sitemaps/static.xml/route';
import {
  SITEMAP_PAGE_SIZE,
  canonicalUrl,
  categorySlug,
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  parseCategories,
  planDurableShardIndex,
  renderSitemapIndex,
  renderUrlset,
  type SitemapEntry,
} from '../../../functions/sitemap/shared';
import { buildCategorySlug } from '@/lib/routes';
import { CATEGORY_SLUG_FIXTURES } from '../../fixtures/categorySlugFixtures';

const sitemapSchema = readFileSync(new URL('../../fixtures/sitemap.xsd', import.meta.url), 'utf8');
const sitemapIndexSchema = readFileSync(new URL('../../fixtures/siteindex.xsd', import.meta.url), 'utf8');

async function expectValidXml(xml: string, schema: string, fileName: string) {
  const result = await validateXML({
    xml: [{ fileName, contents: xml }],
    schema: [schema],
  });
  expect(result.errors, result.rawOutput).toEqual([]);
  expect(result.valid, result.rawOutput).toBe(true);
}

type SitemapRoute = { GET: (request: Request, context: { params: Promise<{ page: string }> }) => Response | Promise<Response> };

async function callTheRouteAsNextJsDoes(
  route: SitemapRoute,
  path: string,
  options: { method?: string; params?: { page?: string } } = {},
) {
  const page = options.params?.page;
  return route.GET(
    new Request(`https://serp-checklists-preview.serp.workers.dev${path}`, { method: options.method ?? 'GET' }),
    { params: Promise.resolve({ page: page === undefined ? '' : `${page}.xml` }) },
  );
}

function shardEntries(count: number): SitemapEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `/profile/user-${index + 1}`,
    lastmod: '2030-01-01T00:00:00Z',
  }));
}

describe('public sitemap behavior', () => {
  it('renders a deterministic, canonical sitemap index with truthful dates', async () => {
    const xml = renderSitemapIndex([
      { path: '/sitemaps/pages/1.xml', lastmod: '2030-08-01 01:02:03' },
      { path: '/sitemaps/categories/1.xml', lastmod: '2030-08-02T02:03:04Z' },
      { path: '/sitemaps/profiles/1.xml', lastmod: '2030-08-03 03:04:05.123' },
      { path: '/sitemaps/templates/1.xml', lastmod: 'invalid' },
    ]);

    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.indexOf('/pages/1.xml')).toBeLessThan(xml.indexOf('/categories/1.xml'));
    expect(xml.indexOf('/categories/1.xml')).toBeLessThan(xml.indexOf('/profiles/1.xml'));
    expect(xml.indexOf('/profiles/1.xml')).toBeLessThan(xml.indexOf('/templates/1.xml'));
    expect(xml).toContain('<lastmod>2030-08-01T01:02:03.000Z</lastmod>');
    expect(xml).toContain('<lastmod>2030-08-02T02:03:04.000Z</lastmod>');
    expect(xml).toContain('<lastmod>2030-08-03T03:04:05.123Z</lastmod>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(3);
    await expectValidXml(xml, sitemapIndexSchema, 'sitemap-index.xml');
  });

  it('makes every <loc> canonical: a page with its trailing slash, a sitemap file without one', () => {
    expect(canonicalUrl('/profile/alice/')).toBe('https://serplists.com/profile/alice/');
    expect(canonicalUrl('/profile/alice')).toBe('https://serplists.com/profile/alice/');
    expect(canonicalUrl('/sitemaps/pages/1.xml')).toBe('https://serplists.com/sitemaps/pages/1.xml');
  });

  it('escapes canonical URL values and preserves entry order', async () => {
    const xml = renderUrlset([
      { path: '/profile/alice/a&b', lastmod: '2026-01-02 03:04:05' },
      { path: '/profile/bob/second', lastmod: null },
    ]);

    expect(xml).toContain('<loc>https://serplists.com/profile/alice/a&amp;b/</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/bob/second/</loc>');
    expect(xml.indexOf('/profile/alice')).toBeLessThan(xml.indexOf('/profile/bob'));
    expect(xml).toContain('<lastmod>2026-01-02T03:04:05.000Z</lastmod>');
    await expectValidXml(xml, sitemapSchema, 'escaped-sitemap.xml');
  });

  it('validates the same public usernames, template slugs, and category values', () => {
    expect(isValidUsername('alice_bob.1')).toBe(true);
    expect(isValidUsername('invalid owner')).toBe(false);
    expect(isValidTemplateSlug('technical-seo')).toBe(true);
    expect(isValidTemplateSlug('Technical SEO')).toBe(false);
    expect(categorySlug(' SEO & Analytics ')).toBe('seo-analytics');
    expect(parseCategories('["SEO & Analytics", "outdoor"]')).toEqual(['SEO & Analytics', 'outdoor']);
    expect(parseCategories('legacy category')).toEqual(['legacy category']);
  });

  it('slugs categories exactly like the category pages do, in every script', () => {
    CATEGORY_SLUG_FIXTURES.forEach((name) => {
      expect(categorySlug(name)).toBe(buildCategorySlug(name));
    });
    expect(categorySlug('日本語')).toBe('日本語');
    expect(categorySlug('Русский')).toBe('русский');
    expect(categorySlug('🚀')).toBe('');
  });

  it('builds deterministic numbered shards at the configured page size', async () => {
    const entries = Array.from({ length: SITEMAP_PAGE_SIZE + 1 }, (_, index) => ({
      path: `/page/${index + 1}`,
      lastmod: index === SITEMAP_PAGE_SIZE ? '2031-01-02T03:04:05Z' : '2030-01-02T03:04:05Z',
    }));

    expect((await planDurableShardIndex('categories', entries, [])).shards).toEqual([
      { path: '/sitemaps/categories/1.xml', lastmod: '2030-01-02T03:04:05.000Z' },
      { path: '/sitemaps/categories/2.xml', lastmod: '2031-01-02T03:04:05.000Z' },
    ]);
  });

  it('preserves an unchanged shard lastmod without an upsert', async () => {
    const entries = shardEntries(2);
    const initial = await planDurableShardIndex('profiles', entries, [], '2030-01-01T00:00:00Z');
    const unchanged = await planDurableShardIndex('profiles', entries, initial.upserts, '2031-01-01T00:00:00Z');

    expect(unchanged.shards).toEqual(initial.shards);
    expect(unchanged.upserts).toEqual([]);
    expect(unchanged.stalePages).toEqual([]);
  });

  it('advances only the shard whose rendered content changes', async () => {
    const entries = shardEntries(SITEMAP_PAGE_SIZE + 1);
    const initial = await planDurableShardIndex('profiles', entries, [], '2030-01-01T00:00:00Z');
    const changed = [{ ...entries[0], path: '/profile/changed' }, ...entries.slice(1)];
    const updated = await planDurableShardIndex('profiles', changed, initial.upserts, '2031-01-01T00:00:00Z');

    expect(updated.upserts.map((row) => row.page)).toEqual([1]);
    expect(firstOf(updated.shards).lastmod).toBe('2031-01-01T00:00:00.000Z');
    expect(elementAt(updated.shards, 1).lastmod).toBe(elementAt(initial.shards, 1).lastmod);
  });

  it('reports stale pages when the sitemap shrinks', async () => {
    const entries = shardEntries(SITEMAP_PAGE_SIZE + 1);
    const initial = await planDurableShardIndex('profiles', entries, [], '2030-01-01T00:00:00Z');
    const shrunk = await planDurableShardIndex(
      'profiles',
      entries.slice(0, SITEMAP_PAGE_SIZE),
      initial.upserts,
      '2031-01-01T00:00:00Z',
    );

    expect(shrunk.stalePages).toEqual([2]);
    expect(shrunk.upserts).toEqual([]);
    expect(shrunk.shards).toHaveLength(1);
  });

  it('uses the current family revision when a removed shard is recreated', async () => {
    const entries = shardEntries(SITEMAP_PAGE_SIZE + 1);
    const initial = await planDurableShardIndex('profiles', entries, [], '2030-01-01T00:00:00Z');
    const currentPage = initial.upserts.filter((row) => row.page === 1);
    const recreated = await planDurableShardIndex('profiles', entries, currentPage, '2032-01-01T00:00:00Z');

    expect(recreated.upserts.map((row) => row.page)).toEqual([2]);
    expect(elementAt(recreated.shards, 1).lastmod).toBe('2032-01-01T00:00:00.000Z');
  });

  it('loads typed database rows with the correct limit and offset', async () => {
    type Row = { path: string; include: boolean };
    const loadRows = vi.fn(async ({ limit, offset }: { limit: number; offset: number }): Promise<Row[]> => {
      expect({ limit, offset }).toEqual({ limit: SITEMAP_PAGE_SIZE, offset: SITEMAP_PAGE_SIZE });
      return [
        { path: '/profile/alice/first', include: true },
        { path: '/profile/alice/private', include: false },
        { path: '/profile/bob/second', include: true },
      ];
    });
    const response = await handlePagedDatabaseSitemap<Row>({
      request: new Request('https://serplists.com/sitemaps/templates/2.xml'),
      params: { page: '2' },
      loadRows,
      toEntry: (row): SitemapEntry | null => row.include ? { path: row.path } : null,
    });
    const xml = await response.text();

    expect(loadRows).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(xml.indexOf('/profile/alice/first')).toBeLessThan(xml.indexOf('/profile/bob/second'));
    expect(xml).not.toContain('/profile/alice/private');
    await expectValidXml(xml, sitemapSchema, 'paged-sitemap.xml');
  });

  it('accounts for prefix entries before loading database rows', async () => {
    const loadRows = vi.fn(async () => [{ path: '/profile/alice/database/' }]);
    const response = await handlePagedDatabaseSitemap<{ path: string }>({
      request: new Request('https://serplists.com/sitemaps/templates/1.xml'),
      params: { page: '1' },
      prefixEntries: [{ path: '/templates/' }, { path: '/profile/serp/bundled/' }],
      loadRows,
      toEntry: (row) => row,
    });
    const xml = await response.text();

    expect(loadRows).toHaveBeenCalledWith({ limit: SITEMAP_PAGE_SIZE - 2, offset: 0 });
    expect(xml.indexOf('/templates')).toBeLessThan(xml.indexOf('/profile/serp/bundled'));
    expect(xml.indexOf('/profile/serp/bundled')).toBeLessThan(xml.indexOf('/profile/alice/database'));
  });

  it('returns 404 for invalid and empty database shards without loading invalid pages', async () => {
    const loadRows = vi.fn(async () => [] as SitemapEntry[]);
    const invalid = await handlePagedDatabaseSitemap<SitemapEntry>({
      request: new Request('https://serplists.com/sitemaps/profiles/0.xml'),
      params: { page: '0' },
      loadRows,
      toEntry: (row) => row,
    });
    const empty = await handlePagedDatabaseSitemap<SitemapEntry>({
      request: new Request('https://serplists.com/sitemaps/profiles/1.xml'),
      params: { page: '1' },
      loadRows,
      toEntry: (row) => row,
    });

    expect(invalid.status).toBe(404);
    expect(empty.status).toBe(404);
    expect(loadRows).toHaveBeenCalledOnce();
  });

  it('publishes canonical static pages and supports HEAD without an XML body', async () => {
    const getResponse = await callTheRouteAsNextJsDoes(pagesSitemapRoute, '/sitemaps/pages/1.xml', {
      params: { page: '1' },
    });
    const xml = await getResponse.text();
    const headResponse = await callTheRouteAsNextJsDoes(pagesSitemapRoute, '/sitemaps/pages/1.xml', {
      method: 'HEAD',
      params: { page: '1' },
    });

    expect(getResponse.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/</loc>');
    expect(xml).toContain('<loc>https://serplists.com/features/template-builder/</loc>');
    expect(xml).not.toContain('/login');
    expect(xml).not.toContain('/profile/');
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get('content-type')).toContain('application/xml');
    expect(await headResponse.text()).toBe('');
    await expectValidXml(xml, sitemapSchema, 'pages-sitemap.xml');
  });

  it('exports only GET, so Next.js answers any other method with 405 before the route runs, and refuses one itself too', async () => {
    for (const route of [pagesSitemapRoute, legacyStaticSitemapRoute, legacyCategoriesSitemapRoute]) {
      expect(Object.keys(route)).toEqual(['GET']);
    }
    const postResponse = await callTheRouteAsNextJsDoes(pagesSitemapRoute, '/sitemaps/pages/1.xml', {
      method: 'POST',
      params: { page: '1' },
    });

    expect(postResponse.status).toBe(405);
    expect(postResponse.headers.get('allow')).toBe('GET, HEAD');
  });

  it('permanently redirects obsolete endpoints', async () => {
    const staticResponse = await callTheRouteAsNextJsDoes(legacyStaticSitemapRoute, '/sitemaps/static.xml?page=2');
    const categoryResponse = await callTheRouteAsNextJsDoes(legacyCategoriesSitemapRoute, '/categories/sitemap.xml?page=2');
    const firstCategoryResponse = await callTheRouteAsNextJsDoes(legacyCategoriesSitemapRoute, '/categories/sitemap.xml');

    expect(staticResponse.status).toBe(308);
    expect(staticResponse.headers.get('location')).toBe('https://serplists.com/sitemaps/pages/2.xml');
    expect(categoryResponse.status).toBe(308);
    expect(categoryResponse.headers.get('location')).toBe('https://serplists.com/sitemaps/categories/2.xml');
    expect(firstCategoryResponse.headers.get('location')).toBe('https://serplists.com/sitemaps/categories/1.xml');
  });
});
