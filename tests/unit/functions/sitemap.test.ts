import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { validateXML } from 'xmllint-wasm';
import * as schema from '../../../db/schema/index';

import { onRequest as sitemapIndex } from '../../../functions/sitemap.xml';
import { onRequest as categoriesSitemap } from '../../../functions/sitemaps/categories/[page].xml';
import { onRequest as profilesSitemap } from '../../../functions/sitemaps/profiles/[page].xml';
import { onRequest as pagesSitemap } from '../../../functions/sitemaps/pages/[page].xml';
import { onRequest as templatesSitemap } from '../../../functions/sitemaps/templates/[page].xml';
import { PUBLIC_CATEGORY_REGISTRY } from '../../../src/data/publicCategories';
import { onRequest as legacyStaticSitemap } from '../../../functions/sitemaps/static.xml';
import { onRequest as legacyCategoriesSitemap } from '../../../functions/categories/sitemap.xml';
import { buildDurableShardIndex, handleInMemoryPagedSitemap } from '../../../functions/sitemap/shared';
import { createSqliteDrizzleFixture } from '../../fixtures/sqlite-drizzle';

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

async function createDb(...queryResults: QueryResult[]) {
  const fixture = createSqliteDrizzleFixture();
  let sequence = 0;
  const users = new Map<string, string>();
  const requestedRevisions = new Map<string, string>();
  const ensureUser = async (row: Record<string, unknown>) => {
    const username = String(row.username ?? `owner_${sequence}`);
    if (users.has(username)) return users.get(username)!;
    const id = `user-${sequence++}`;
    users.set(username, id);
    await fixture.db.insert(schema.users).values({
      id,
      email: `${id}@example.invalid`,
      username,
      created_at: String(row.created_at ?? '2026-01-01 00:00:00'),
      updated_at: row.updated_at == null ? null : String(row.updated_at),
    });
    if (row.profile_revision) await fixture.db.insert(schema.sitemap_profile_revisions)
      .values({ user_id: id, revised_at: String(row.profile_revision) })
      .onConflictDoUpdate({ target: schema.sitemap_profile_revisions.user_id, set: { revised_at: String(row.profile_revision) } });
    if (row.owner_updated_at) await fixture.db.insert(schema.sitemap_owner_revisions)
      .values({ user_id: id, revised_at: String(row.owner_updated_at) })
      .onConflictDoUpdate({ target: schema.sitemap_owner_revisions.user_id, set: { revised_at: String(row.owner_updated_at) } });
    return id;
  };
  for (const result of queryResults) {
    const rows = [...(result.results ?? []), ...(result.first ? [result.first] : [])] as Array<Record<string, unknown>>;
    for (const row of rows) {
      if (typeof row.kind === 'string') {
        requestedRevisions.set(row.kind, String(row.revised_at));
      } else if (result.first && row.revised_at && !row.category && !row.username) {
        requestedRevisions.set('templates', String(row.revised_at));
      } else if (row.category && row.revised_at && !row.created_at) {
        await fixture.db.insert(schema.sitemap_category_revisions).values({ category: String(row.category), revised_at: String(row.revised_at) })
          .onConflictDoUpdate({ target: schema.sitemap_category_revisions.category, set: { revised_at: String(row.revised_at) } });
      } else if (row.slug || row.category) {
        const userId = await ensureUser(row);
        await fixture.db.insert(schema.templates).values({
          id: `template-${sequence++}`,
          user_id: userId,
          title: 'Fixture template',
          items: '[]',
          slug: row.slug == null ? `category-${sequence}` : String(row.slug),
          category: row.category == null ? null : String(row.category),
          owner_type: 'user',
          is_public: true,
          created_at: String(row.created_at ?? '2026-01-01 00:00:00'),
          updated_at: row.updated_at == null ? null : String(row.updated_at),
        });
      } else if (row.username) {
        await ensureUser(row);
      }
    }
  }
  for (const [kind, revised_at] of requestedRevisions) {
    await fixture.db.update(schema.sitemap_revisions).set({ revised_at })
      .where(eq(schema.sitemap_revisions.kind, kind));
  }
  return fixture;
}

async function request(
  handler: PagesFunction,
  path: string,
  options: { method?: string; db?: ReturnType<typeof createDb>; params?: Record<string, string> } = {},
) {
  const fixture = await (options.db ?? createDb());
  const response = await handler({
    request: new Request(`https://preview.serplists.pages.dev${path}`, {
      method: options.method ?? 'GET',
    }),
    env: { DB: fixture.binding },
    params: options.params ?? {},
    data: {},
    functionPath: path,
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response(null, { status: 404 }),
  } as never);
  fixture.close();
  return response;
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
    const fixture = createSqliteDrizzleFixture();
    const entries = Array.from({ length: 25_001 }, (_, index) => ({
      path: `/profile/u${String(index).padStart(5, '0')}`,
      lastmod: '2030-03-01 00:00:00',
    }));
    try {
      const first = await buildDurableShardIndex(fixture.db as never, 'profiles', entries, '2030-03-01 00:00:00');
      expect((await buildDurableShardIndex(fixture.db as never, 'profiles', entries, '2030-03-01 00:00:00'))).toEqual(first);
      entries[0].lastmod = '2031-04-01 00:00:00';
      const updated = await buildDurableShardIndex(fixture.db as never, 'profiles', entries, '2031-04-01 00:00:00');
      expect(updated.map((entry) => entry.lastmod)).toEqual([
        '2031-04-01T00:00:00.000Z',
        '2030-03-01T00:00:00.000Z',
      ]);
      const removed = entries.pop();
      const shrunk = await buildDurableShardIndex(fixture.db as never, 'profiles', entries, '2032-05-01 00:00:00');
      expect(shrunk).toHaveLength(1);
      entries.push(removed!);
      const recreated = await buildDurableShardIndex(fixture.db as never, 'profiles', entries, '2033-05-01 00:00:00');
      expect(recreated).toHaveLength(2);
      expect(recreated[1].lastmod).toBe('2033-05-01T00:00:00.000Z');
    } finally {
      fixture.close();
    }
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
      path: `/categories/category-${String(index + 1).padStart(5, '0')}`,
      lastmod: '2026-01-02 03:04:05',
    }));
    const response = await handleInMemoryPagedSitemap(
      new Request('https://serplists.com/sitemaps/categories/2.xml'),
      '2',
      () => rows,
    );
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain('/categories/category-25001');
    expect(xml).not.toContain('/categories/category-25000<');
    expect(xml.match(/<url>/g)).toHaveLength(1);
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
