import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sitemapLocations } from '../../support/sitemapLocations';
import { SqliteD1 } from '../../support/sqlite-d1';

const generated = vi.hoisted(() => ({
  catalog: {
    staticPages: [] as Array<{ path: string; lastmod: string }>,
    templates: [] as Array<{ slug?: string; lastmod?: string }>,
  },
}));

vi.mock('../../../functions/sitemap/bundled-catalog.generated.json', () => ({ default: generated.catalog }));

const catalogPages = [
  { path: '/templates/', lastmod: '2026-10-01T00:00:00.000Z' },
  { path: '/categories/', lastmod: '2026-10-01T00:00:00.000Z' },
];

const templatesSitemap = async () => (await import('../../../functions/sitemap/routes')).serveTemplatesSitemap;

let d1: SqliteD1;

beforeEach(() => {
  vi.resetModules();
  d1 = new SqliteD1();
});

afterEach(() => {
  d1.close();
});

describe('the bundled templates the generated sitemap catalog lists', () => {
  it('lists each bundled template under the SERP profile, and skips one whose slug is not a template slug', async () => {
    generated.catalog.staticPages = catalogPages;
    generated.catalog.templates = [
      { slug: 'launch-plan', lastmod: '2026-09-01T00:00:00.000Z' },
      { slug: 'Launch Plan' },
      { slug: '   ' },
      {},
    ];

    expect(await sitemapLocations(d1, await templatesSitemap(), '/sitemaps/templates/1.xml')).toEqual([
      '/templates/',
      '/profile/serp/launch-plan/',
    ]);
  });

  it('refuses to serve the templates sitemap when the catalog has no metadata for the Template Library page', async () => {
    generated.catalog.staticPages = catalogPages.filter((page) => page.path !== '/templates/');
    generated.catalog.templates = [];

    await expect(sitemapLocations(d1, await templatesSitemap(), '/sitemaps/templates/1.xml')).rejects.toThrow(
      'Missing generated sitemap metadata for /templates/',
    );
  });
});
