import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';

import { onRequest as sitemapIndex } from '../../../functions/sitemap.xml';
import { onRequest as categoriesSitemap } from '../../../functions/sitemaps/categories/[page].xml';
import { onRequest as profilesSitemap } from '../../../functions/sitemaps/profiles/[page].xml';
import { onRequest as pagesSitemap } from '../../../functions/sitemaps/pages/[page].xml';
import { onRequest as templatesSitemap } from '../../../functions/sitemaps/templates/[page].xml';
import { PUBLIC_CATEGORY_REGISTRY } from '../../../src/data/publicCategories';
import { onRequest as legacyStaticSitemap } from '../../../functions/sitemaps/static.xml';
import { onRequest as legacyCategoriesSitemap } from '../../../functions/categories/sitemap.xml';

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
        async run() {
          return { success: true };
        },
      };
      return statement;
    },
  };
}

function createStatefulSitemapDb(data: {
  profiles: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  revisions: Map<string, string>;
}) {
  const shardState = new Map<string, { page: number; content_hash: string; revised_at: string }>();
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { bindings = values; return statement; },
        async first() { return null; },
        async all() {
          if (sql.includes('FROM users u LEFT JOIN sitemap_profile_revisions')) return { results: data.profiles };
          if (sql.includes('FROM templates t JOIN users u')) return { results: data.templates };
          if (sql.includes('SELECT t.category')) return { results: data.categories };
          if (sql.includes('sitemap_category_revisions')) return { results: [] };
          if (sql.includes('SELECT kind, revised_at FROM sitemap_revisions')) {
            return { results: Array.from(data.revisions, ([kind, revised_at]) => ({ kind, revised_at })) };
          }
          if (sql.includes('FROM sitemap_shard_revisions')) {
            const kind = String(bindings[0]);
            return { results: Array.from(shardState.entries())
              .filter(([key]) => key.startsWith(`${kind}:`))
              .map(([, row]) => row) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO sitemap_shard_revisions')) {
            const [kind, page, content_hash, revised_at] = bindings as [string, number, string, string];
            shardState.set(`${kind}:${page}`, { page, content_hash, revised_at });
          }
          if (sql.includes('DELETE FROM sitemap_shard_revisions')) {
            const [kind, pageCount] = bindings as [string, number];
            for (const key of shardState.keys()) {
              const [rowKind, rowPage] = key.split(':');
              if (rowKind === kind && Number(rowPage) > pageCount) shardState.delete(key);
            }
          }
          return { success: true };
        },
      };
      return statement;
    },
  };
}

function sitemapLastmods(xml: string, kind: string): string[] {
  return Array.from(
    xml.matchAll(new RegExp(`<loc>https://serplists\\.com/sitemaps/${kind}/\\d+\\.xml</loc>\\s*<lastmod>([^<]+)</lastmod>`, 'g')),
    (match) => match[1],
  );
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
        { results: [{ username: 'alice', created_at: '2026-01-01 00:00:00', updated_at: null, profile_revision: '2026-08-01 01:02:03' }] },
        { results: [{ username: 'alice', slug: 'seo', created_at: '2026-01-01 00:00:00', updated_at: null, owner_updated_at: null }] },
        { results: [{ category: 'SEO', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-04-05T00:00:00.000Z' }] },
        { results: [] },
        { results: [
          { kind: 'profiles', revised_at: '2030-08-01 01:02:03' },
          { kind: 'templates', revised_at: '2030-08-02 02:03:04' },
          { kind: 'categories', revised_at: '2030-08-03 03:04:05' },
        ] },
        { results: [] }, {},
        { results: [] }, {},
        { results: [] }, {},
        { results: [] }, {},
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
    expect(xml).toContain('<loc>https://serplists.com/sitemaps/templates/1.xml</loc>');
    expect(xml).not.toContain('?page=');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<sitemap>/g)?.length ?? 0,
    );
    expect(xml).toContain('<lastmod>2030-08-01T01:02:03.000Z</lastmod>');
    expect(xml).toContain('<lastmod>2030-08-02T02:03:04.000Z</lastmod>');
    expect(xml).toContain('<lastmod>2030-08-03T03:04:05.000Z</lastmod>');
    expect(xml.match(/<sitemap>/g)?.length ?? 0).toBeLessThanOrEqual(50_000);
    expect(new TextEncoder().encode(xml).byteLength).toBeLessThanOrEqual(50 * 1024 * 1024);
    await expectValidXml(xml, sitemapIndexSchema, 'sitemap-index.xml');
  });

  it('changes only sitemap shard dates whose rendered membership or content changes', async () => {
    const profiles = Array.from({ length: 25_001 }, (_, index) => ({
      username: `u${String(index).padStart(5, '0')}`,
      created_at: '2026-01-01 00:00:00',
      updated_at: null,
      profile_revision: '2030-03-01 00:00:00',
    }));
    const templates = Array.from({ length: 25_001 }, (_, index) => ({
      username: `u${String(index).padStart(5, '0')}`,
      slug: `template-${String(index).padStart(5, '0')}`,
      created_at: '2026-01-01 00:00:00', updated_at: null, owner_updated_at: null,
    }));
    const categories = Array.from({ length: 25_001 }, (_, index) => ({
      category: `category-${String(index).padStart(5, '0')}`,
      created_at: '2026-01-01 00:00:00', updated_at: null, owner_updated_at: null,
    }));
    const revisions = new Map([
      ['profiles', '2030-03-01 00:00:00'],
      ['templates', '2030-03-01 00:00:00'],
      ['categories', '2030-03-01 00:00:00'],
    ]);
    const db = createStatefulSitemapDb({ profiles, templates, categories, revisions });

    const firstXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();
    const authOnlyXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();
    expect(authOnlyXml).toBe(firstXml);
    profiles[0].profile_revision = '2031-04-01 00:00:00';
    templates[0].updated_at = '2031-04-01 00:00:00';
    categories[0].updated_at = '2031-04-01 00:00:00';
    revisions.set('profiles', '2031-04-01 00:00:00');
    revisions.set('templates', '2031-04-01 00:00:00');
    revisions.set('categories', '2031-04-01 00:00:00');
    const updateXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();

    expect(sitemapLastmods(firstXml, 'profiles')).toEqual([
      '2030-03-01T00:00:00.000Z',
      '2030-03-01T00:00:00.000Z',
    ]);
    expect(sitemapLastmods(updateXml, 'profiles')).toEqual([
      '2031-04-01T00:00:00.000Z',
      '2030-03-01T00:00:00.000Z',
    ]);
    expect(sitemapLastmods(updateXml, 'templates')).toEqual([
      '2031-04-01T00:00:00.000Z', '2030-03-01T00:00:00.000Z',
    ]);
    expect(sitemapLastmods(updateXml, 'categories')).toEqual([
      '2031-04-01T00:00:00.000Z', '2030-03-01T00:00:00.000Z',
    ]);

    profiles.unshift({
      username: 'a00000', created_at: '2032-05-01 00:00:00', updated_at: null,
      profile_revision: '2032-05-01 00:00:00',
    });
    templates.unshift({
      username: 'a00000', slug: 'template-new', created_at: '2032-05-01 00:00:00',
      updated_at: null, owner_updated_at: null,
    });
    categories.unshift({
      category: 'category-new', created_at: '2032-05-01 00:00:00',
      updated_at: null, owner_updated_at: null,
    });
    revisions.set('profiles', '2032-05-01 00:00:00');
    revisions.set('templates', '2032-05-01 00:00:00');
    revisions.set('categories', '2032-05-01 00:00:00');
    const insertXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();
    expect(sitemapLastmods(insertXml, 'profiles')).toEqual([
      '2032-05-01T00:00:00.000Z',
      '2032-05-01T00:00:00.000Z',
    ]);
    expect(sitemapLastmods(insertXml, 'templates')).toEqual([
      '2032-05-01T00:00:00.000Z', '2032-05-01T00:00:00.000Z',
    ]);
    expect(sitemapLastmods(insertXml, 'categories')).toEqual([
      '2032-05-01T00:00:00.000Z', '2032-05-01T00:00:00.000Z',
    ]);

    const completeProfiles = [...profiles];
    profiles.splice(25_000);
    revisions.set('profiles', '2033-05-01 00:00:00');
    const shrinkXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();
    expect(sitemapLastmods(shrinkXml, 'profiles')).toEqual(['2032-05-01T00:00:00.000Z']);

    profiles.push(...completeProfiles.slice(25_000));
    revisions.set('profiles', '2034-05-01 00:00:00');
    const recreateXml = await (await request(sitemapIndex, '/sitemap.xml', { db: db as never })).text();
    expect(sitemapLastmods(recreateXml, 'profiles')).toEqual([
      '2032-05-01T00:00:00.000Z', '2034-05-01T00:00:00.000Z',
    ]);
  }, 15_000);

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
      db: createDb(
        { results: [{ kind: 'categories', revised_at: '2020-09-04 01:02:03' }] },
        { results: [
          { category: '["SEO & Analytics", "outdoor"]', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z', owner_updated_at: '2026-06-07T00:00:00.000Z' },
          { category: 'SEO & Analytics', created_at: '2026-02-01T00:00:00.000Z', updated_at: null, owner_updated_at: null },
        ] },
        { results: [
          { category: 'SEO & Analytics', revised_at: '2031-01-02 03:04:05' },
          { category: 'legacy-only', revised_at: '2031-01-03 03:04:05' },
        ] },
      ),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml.match(/\/categories\/seo-analytics/g)).toHaveLength(1);
    expect(xml.match(/\/categories\/outdoor/g)).toHaveLength(1);
    expect(xml).not.toContain('/categories/legacy-only');
    for (const category of PUBLIC_CATEGORY_REGISTRY) {
      expect(xml).toContain(`<loc>https://serplists.com/categories/${category.slug}</loc>`);
    }
    expect(xml).toContain('<loc>https://serplists.com/categories</loc>');
    expect(xml).toContain(
      '<loc>https://serplists.com/categories</loc>\n    <lastmod>2031-01-02T03:04:05.000Z</lastmod>',
    );
    expect(xml).toContain(
      '<loc>https://serplists.com/categories/seo-analytics</loc>\n    <lastmod>2031-01-02T03:04:05.000Z</lastmod>',
    );
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<url>/g)?.length ?? 0,
    );
    await expectValidXml(xml, sitemapSchema, 'category-sitemap.xml');
  });

  it('publishes canonical profile URLs with truthful modification dates', async () => {
    const response = await request(profilesSitemap, '/sitemaps/profiles/1.xml', {
      params: { page: '1' },
      db: createDb({ results: [
          {
            username: 'alice_bob',
            created_at: '2026-01-02 00:00:00',
            updated_at: '2026-02-03 04:05:06.123',
            profile_revision: '2026-07-08 09:10:11',
          },
          {
            username: 'invalid & profile',
            created_at: '2026-01-02T00:00:00.000Z',
            updated_at: null,
            profile_revision: null,
          },
        ] }),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/profile/alice_bob</loc>');
    expect(xml).not.toContain('invalid%20%26%20profile');
    expect(xml).toContain('<lastmod>2026-07-08T09:10:11.000Z</lastmod>');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<url>/g)?.length ?? 0,
    );
    await expectValidXml(xml, sitemapSchema, 'profile-sitemap.xml');
  });

  it('publishes only rows supplied by the public-template inventory', async () => {
    const response = await request(templatesSitemap, '/sitemaps/templates/1.xml', {
      params: { page: '1' },
      db: createDb(
        { first: { revised_at: '2026-09-04 00:00:01' } },
        { results: [
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
        ] },
      ),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('<loc>https://serplists.com/templates</loc>');
    expect(xml).toContain(
      '<loc>https://serplists.com/templates</loc>\n    <lastmod>2026-09-04T00:00:01.000Z</lastmod>',
    );
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

  it('does not advance an unchanged sibling template after another template changes', async () => {
    const response = await request(templatesSitemap, '/sitemaps/templates/1.xml', {
      params: { page: '1' },
      db: createDb(
        { first: { revised_at: '2031-01-01 00:00:00' } },
        { results: [
          { username: 'alice', slug: 'changed', created_at: '2026-01-01 00:00:00', updated_at: '2031-01-01 00:00:00', owner_updated_at: '2026-02-01 00:00:00' },
          { username: 'alice', slug: 'unchanged', created_at: '2026-01-01 00:00:00', updated_at: '2026-03-01 00:00:00', owner_updated_at: '2026-02-01 00:00:00' },
        ] },
      ),
    });
    const xml = await response.text();

    expect(xml).toContain(
      '<loc>https://serplists.com/profile/alice/changed</loc>\n    <lastmod>2031-01-01T00:00:00.000Z</lastmod>',
    );
    expect(xml).toContain(
      '<loc>https://serplists.com/profile/alice/unchanged</loc>\n    <lastmod>2026-03-01T00:00:00.000Z</lastmod>',
    );
  });

  it('returns 404 for an invalid or empty shard, including page one', async () => {
    const invalid = await request(profilesSitemap, '/sitemaps/profiles/0.xml', {
      params: { page: '0' },
    });
    const empty = await request(templatesSitemap, '/sitemaps/templates/2.xml', {
      params: { page: '2' },
      db: createDb({ first: { revised_at: '2026-09-04 00:00:01' } }, { results: [] }),
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
      created_at: '2026-01-02 03:04:05',
      updated_at: null,
      owner_updated_at: null,
    }));
    const response = await request(categoriesSitemap, '/sitemaps/categories/2.xml', {
      params: { page: '2' },
      db: createDb(
        { results: [{ kind: 'categories', revised_at: '2030-09-04 01:02:03' }] },
        { results: rows },
        { results: [] },
      ),
    });
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('/categories/category-25000');
    expect(xml).toContain('/categories/category-25001');
    expect(xml).toContain('/categories/category-24999');
    expect(xml).not.toContain('/categories/category-24998<');
    expect(xml.match(/<lastmod>[^<]+<\/lastmod>/g)).toHaveLength(
      xml.match(/<url>/g)?.length ?? 0,
    );
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

  it('permanently redirects obsolete sitemap endpoints to numbered shards', async () => {
    const staticResponse = await request(legacyStaticSitemap, '/sitemaps/static.xml?page=2');
    const categoryResponse = await request(
      legacyCategoriesSitemap,
      '/categories/sitemap.xml?page=2',
    );

    expect(staticResponse.status).toBe(308);
    expect(staticResponse.headers.get('location')).toBe(
      'https://serplists.com/sitemaps/pages/2.xml',
    );
    expect(categoryResponse.status).toBe(308);
    expect(categoryResponse.headers.get('location')).toBe(
      'https://serplists.com/sitemaps/categories/2.xml',
    );
  });
});
