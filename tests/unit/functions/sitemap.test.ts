import { describe, expect, it } from 'vitest';

import { onRequest as sitemapIndex } from '../../../functions/sitemap.xml';
import { onRequest as categoriesSitemap } from '../../../functions/sitemaps/categories/[page].xml';
import { onRequest as profilesSitemap } from '../../../functions/sitemaps/profiles/[page].xml';
import { onRequest as staticSitemap } from '../../../functions/sitemaps/static/[page].xml';
import { onRequest as templatesSitemap } from '../../../functions/sitemaps/templates/[page].xml';

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
        { results: [
          { page: 1, lastmod: '2026-02-03T00:00:00.000Z' },
          { page: 2, lastmod: '2026-02-04T00:00:00.000Z' },
        ] },
        { results: [{ page: 1, lastmod: '2026-03-04T00:00:00.000Z' }] },
        { results: [{ category: 'SEO', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-04-05T00:00:00.000Z' }] },
      ),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/static/1.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/categories/1.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/profiles/1.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/profiles/2.xml</loc>');
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/templates/1.xml</loc>');
    expect(xml).not.toContain('?page=');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(5);
  });

  it('publishes canonical static pages and bundled public templates', async () => {
    const response = await request(staticSitemap, '/sitemaps/static/1.xml', {
      params: { page: '1' },
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/</loc>');
    expect(xml).toContain('<loc>https://serplists.com/features/template-builder</loc>');
    expect(xml).toContain('<loc>https://serplists.com/profile/serp/ultimate-camping-checklist</loc>');
    expect(xml.match(/<url>[\s\S]*?<lastmod>[^<]+<\/lastmod>[\s\S]*?<\/url>/g)).toHaveLength(15);
    expect(xml).not.toContain('/login');
    expect(xml).not.toContain('/checklists');
    expect(xml).not.toContain('<priority>');
    expect(xml).not.toContain('<changefreq>');
  });

  it('publishes deduplicated database and bundled-template categories', async () => {
    const response = await request(categoriesSitemap, '/sitemaps/categories/1.xml', {
      params: { page: '1' },
      db: createDb({
        results: [
          { category: '["SEO & Analytics", "outdoor"]', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' },
          { category: 'SEO & Analytics', created_at: '2026-02-01T00:00:00.000Z', updated_at: null },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml.match(/\/categories\/seo-analytics/g)).toHaveLength(1);
    expect(xml.match(/\/categories\/outdoor/g)).toHaveLength(1);
    expect(xml).toContain('<lastmod>2026-05-06T00:00:00.000Z</lastmod>');
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
          },
          {
            username: 'invalid & profile',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
          },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/profile/alice_bob</loc>');
    expect(xml).not.toContain('invalid%20%26%20profile');
    expect(xml).toContain('<lastmod>2026-02-03T00:00:00.000Z</lastmod>');
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
          },
          {
            username: 'invalid owner',
            slug: 'invalid slug',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
          },
        ],
      }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/profile/alice/technical-seo</loc>');
    expect(xml).not.toContain('invalid%20owner');
    expect(xml).toContain('<lastmod>2026-01-02T00:00:00.000Z</lastmod>');
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
    expect(xml).toContain('/categories/category-25001');
    expect(xml).not.toContain('/categories/category-25000<');
  });

  it('supports HEAD without returning an XML body', async () => {
    const response = await request(staticSitemap, '/sitemaps/static/1.xml', {
      method: 'HEAD',
      params: { page: '1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(await response.text()).toBe('');
  });
});
