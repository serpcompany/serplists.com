import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';

import { onRequest as sitemapIndex } from '../../../functions/sitemap.xml';
import { onRequest as categoriesSitemap } from '../../../functions/sitemaps/categories/[page].xml';
import { onRequest as profilesSitemap } from '../../../functions/sitemaps/profiles/[page].xml';
import { onRequest as pagesSitemap } from '../../../functions/sitemaps/pages/[page].xml';
import { onRequest as templatesSitemap } from '../../../functions/sitemaps/templates/[page].xml';

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

type QueryResult = {
  first?: unknown;
  results?: unknown[];
};

function createDb(...queryResults: QueryResult[]) {
  let queryIndex = 0;

  return {
    prepare() {
      const result = queryResults[queryIndex++] ?? {};
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          return result.first ?? null;
        },
        async all() {
          return { results: result.results ?? [] };
        },
      };
      return statement;
    },
  };
}

async function request(
  handler: PagesFunction,
  path: string,
  options: { method?: string; db?: ReturnType<typeof createDb>; params?: Record<string, string> } = {},
) {
  return handler({
    request: new Request(`https://preview.serplists.pages.dev${path}`, {
      method: options.method ?? 'GET',
    }),
    env: { DB: options.db ?? createDb() },
    params: options.params ?? {},
    data: {},
    functionPath: path,
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response(null, { status: 404 }),
  } as never);
}

describe('public sitemap HTTP responses', () => {
  it('publishes a sitemap index with every required shard', async () => {
    const response = await request(sitemapIndex, '/sitemap.xml', {
      db: createDb(
        { first: { count: 25_001 } },
        { first: { count: 1 } },
        { results: [{ category: 'SEO', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-04-05T00:00:00.000Z' }] },
      ),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/pages/1.xml</loc>');
    expect(xml).not.toContain('/sitemaps/static/');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/categories/1.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/profiles/1.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/profiles/2.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/templates/1.xml</loc>');
    expect(xml).not.toContain('?page=');
    expect(xml).not.toContain('<lastmod>');
    expect(xml.match(/<sitemap>/g)?.length ?? 0).toBeLessThanOrEqual(50_000);
    expect(new TextEncoder().encode(xml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
    await expectValidXml(xml, sitemapIndexSchema, 'sitemap-index.xml');
  });

  it('publishes canonical static pages and bundled public templates', async () => {
    const response = await request(pagesSitemap, '/sitemaps/pages/1.xml', {
      params: { page: '1' },
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    const indexedPages = Array.from(
      xml.matchAll(/<loc>https:\/\/serplists\.com(\/(?!profile\/serp\/)[^<]*)<\/loc>/g),
      (match) => match[1],
    );
    expect(indexedPages).toEqual([
      '/',
      '/features',
      '/features/template-builder',
      '/features/checklist-runs',
      '/features/public-sharing',
      '/features/import-export',
      '/pricing',
      '/about',
      '/contact',
    ]);
    expect(xml).toContain('<loc>https://serplists.com/</loc>');
    expect(xml).toContain('<loc>https://serplists.com/features/template-builder</loc>');
    expect(xml).not.toContain('<loc>https://serplists.com/templates</loc>');
    expect(xml).not.toContain('<loc>https://serplists.com/categories</loc>');
    expect(xml).not.toContain('/profile/');
    expect(xml.match(/<url>/g)).toHaveLength(9);
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(9);
    expect(xml).not.toContain('/login');
    expect(xml).not.toContain('/checklists');
    expect(xml).not.toContain('<loc>https://serplists.com/docs</loc>');
    expect(xml).not.toContain('<priority>');
    expect(xml).not.toContain('<changefreq>');
    await expectValidXml(xml, sitemapSchema, 'pages-sitemap.xml');
  });

  it('publishes deduplicated database and bundled-template categories', async () => {
    const response = await request(categoriesSitemap, '/sitemaps/categories/1.xml', {
      params: { page: '1' },
      db: createDb({
        results: [
          { category: '["SEO & Analytics", "outdoor"]', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z', owner_updated_at: '2026-06-07T00:00:00.000Z' },
          { category: 'SEO & Analytics', created_at: '2026-02-01T00:00:00.000Z', updated_at: null, owner_updated_at: null },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml.match(/\/categories\/seo-analytics/g)).toHaveLength(1);
    expect(xml.match(/\/categories\/outdoor/g)).toHaveLength(1);
    expect(xml).toContain('<loc>https://serplists.com/categories</loc>');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<url>/g)?.length ?? 0,
    );
    await expectValidXml(xml, sitemapSchema, 'category-sitemap.xml');
  });

  it('publishes canonical profile URLs with truthful modification dates', async () => {
    const response = await request(profilesSitemap, '/sitemaps/profiles/1.xml', {
      params: { page: '1' },
      db: createDb({
        results: [
          {
            username: 'alice_bob',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: '2026-02-03T00:00:00.000Z',
            template_lastmod: '2026-07-08T00:00:00.000Z',
          },
          {
            username: 'invalid & profile',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
            template_lastmod: null,
          },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/profile/alice_bob</loc>');
    expect(xml).not.toContain('invalid%20%26%20profile');
    expect(xml).not.toContain('<lastmod>');
    await expectValidXml(xml, sitemapSchema, 'profile-sitemap.xml');
  });

  it('publishes only rows supplied by the public-template inventory', async () => {
    const response = await request(templatesSitemap, '/sitemaps/templates/1.xml', {
      params: { page: '1' },
      db: createDb({
        results: [
          {
            username: 'alice',
            slug: 'technical-seo',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
            owner_updated_at: '2026-08-09T00:00:00.000Z',
          },
          {
            username: 'invalid owner',
            slug: 'invalid slug',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
            owner_updated_at: null,
          },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/templates</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/serp/complete-wedding-planning-checklist</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/serp/full-website-launch-qa-checklist</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/serp/ultimate-camping-checklist</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/alice/technical-seo</loc>');
    expect(xml).not.toContain('invalid%20owner');
    expect(xml).toContain('<lastmod>2026-08-09T00:00:00.000Z</lastmod>');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<url>/g)?.length ?? 0,
    );
    await expectValidXml(xml, sitemapSchema, 'template-sitemap.xml');
  });

  it('returns 404 for an invalid or empty shard, including page one', async () => {
    const invalid = await request(profilesSitemap, '/sitemaps/profiles/0.xml', {
      params: { page: '0' },
    });
    const empty = await request(templatesSitemap, '/sitemaps/templates/2.xml', {
      params: { page: '2' },
      db: createDb({ results: [] }),
    });
    const emptyFirst = await request(profilesSitemap, '/sitemaps/profiles/1.xml', {
      params: { page: '1' },
      db: createDb({ results: [] }),
    });

    expect(invalid.status).toBe(404);
    expect(empty.status).toBe(404);
    expect(emptyFirst.status).toBe(404);
  });

  it('paginates category sitemap output at the configured shard size', async () => {
    const rows = Array.from({ length: 25_001 }, (_, index) => ({
      category: `category ${String(index + 1).padStart(5, '0')}`,
    }));
    const response = await request(categoriesSitemap, '/sitemaps/categories/2.xml', {
      params: { page: '2' },
      db: createDb({ results: rows }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('/categories/category-25000');
    expect(xml).toContain('/categories/category-25001');
    expect(xml).not.toContain('/categories/category-24999<');
  });

  it('supports HEAD without returning an XML body', async () => {
    const response = await request(pagesSitemap, '/sitemaps/pages/1.xml', {
      method: 'HEAD',
      params: { page: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(await response.text()).toBe('');
  });
});
