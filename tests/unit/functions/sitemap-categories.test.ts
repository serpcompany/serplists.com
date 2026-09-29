import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import bundledCatalog from '../../../functions/sitemap/bundled-catalog.generated.json';
import { categorySlug } from '../../../functions/sitemap/shared';
import { PUBLIC_CATEGORY_REGISTRY } from '../../../src/data/publicCategories';
import { GET as sitemapIndexGet } from '@/app/sitemap.xml/route';
import { GET as categoriesShardGet } from '@/app/sitemaps/categories/[page]/route';
import { serverContext } from '../../support/nextServerContext';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('../../support/nextServerContext')).cloudflareMock);

// A sitemap route handler, given the Worker's bindings and waitUntil through
// getCloudflareContext, and the page's file name as Next.js passes it (`1.xml`).
type RouteGet = (request: Request, context: { params: Promise<{ page: string }> }) => Response | Promise<Response>;
type SitemapRequest = {
  request: Request;
  env: unknown;
  waitUntil?: (promise: Promise<unknown>) => void;
  params?: { page?: string };
};
const sitemapRoute = (GET: RouteGet) => async ({ request, env, waitUntil, params }: SitemapRequest) => {
  serverContext.env = env as Record<string, unknown>;
  serverContext.waitUntil = [];
  const response = await GET(request, { params: Promise.resolve({ page: `${params?.page ?? ''}.xml` }) });
  serverContext.waitUntil.forEach((promise) => waitUntil?.(promise));
  return response;
};

const sitemapIndex = sitemapRoute(sitemapIndexGet);
const categoriesShard = sitemapRoute(categoriesShardGet);

// The sitemap index hashes each shard's rendering to decide when that shard's <lastmod>
// moves. These tests run the real index and categories shard handlers against SQLite
// with the real sitemap triggers, so any difference between what the index hashes and
// what the shard serves shows up as a hash mismatch.

let db: DatabaseSync;

// The subset of D1's prepared statement API that Drizzle's D1 driver calls.
function d1(database: DatabaseSync) {
  return {
    prepare(query: string) {
      let params: Array<string | number | null> = [];
      const statement = {
        bind: (...values: Array<string | number | null>) => { params = values; return statement; },
        raw: async () => database.prepare(query).all(...params).map((row) => Object.values(row)),
        all: async () => ({ results: database.prepare(query).all(...params) }),
        run: async () => { database.prepare(query).run(...params); return { success: true, meta: {} }; },
      };
      return statement;
    },
  };
}

async function get(handler: typeof sitemapIndex, path: string, params: { page?: string } = {}) {
  const response = await handler({
    request: new Request(`https://serplists.com${path}`),
    env: { DB: d1(db) },
    params,
  });
  expect(response.status, path).toBe(200);
  return response.text();
}

async function buildBoth() {
  const index = await get(sitemapIndex, '/sitemap.xml');
  const shard = await get(categoriesShard, '/sitemaps/categories/1.xml', { page: '1' });
  const indexLastmod = index.match(
    /<loc>https:\/\/serplists\.com\/sitemaps\/categories\/1\.xml<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/,
  )?.[1];
  const stored = db.prepare(
    `SELECT content_hash FROM sitemap_shard_revisions WHERE kind = 'categories' AND page = 1`,
  ).get() as { content_hash: string };
  const shardLastmods = Array.from(shard.matchAll(/<lastmod>([^<]+)<\/lastmod>/g), (match) => match[1]).sort();
  const landingLastmod = shard.match(
    /<loc>https:\/\/serplists\.com\/categories<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/,
  )?.[1];
  return { shard, indexLastmod, storedHash: stored.content_hash, shardLastmods, landingLastmod };
}

function expectIndexMatchesShard(result: Awaited<ReturnType<typeof buildBoth>>) {
  expect(createHash('sha256').update(result.shard).digest('hex')).toBe(result.storedHash);
  expect(result.indexLastmod).toBeDefined();
  expect(result.indexLastmod! >= result.shardLastmods.at(-1)!).toBe(true);
}

describe('categories sitemap index and shard', () => {
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT, name TEXT, avatar_url TEXT, email TEXT,
        email_verified INTEGER, created_at TEXT NOT NULL, updated_at TEXT, auth_updated_at INTEGER
      );
      CREATE TABLE templates (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL,
        team_id TEXT, is_public INTEGER, deleted_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT, category TEXT, slug TEXT
      );
    `);
    db.exec(readFileSync(
      new URL('../../../db/migrations/0023_add_sitemap_revision_state.sql', import.meta.url),
      'utf8',
    ));
    db.exec(`
      INSERT INTO users VALUES ('u1', 'alice', 'Alice', NULL, 'alice@example.com', 0,
        '2020-01-01 00:00:00', '2020-01-01 00:00:00', NULL);
      INSERT INTO templates VALUES ('t1', 'u1', 'user', NULL, 1, NULL,
        '2020-01-02 00:00:00', NULL, '["Outdoor Gear"]', 'gear-list');
      UPDATE sitemap_revisions SET revised_at = '2020-01-03 00:00:00';
      UPDATE sitemap_category_revisions SET revised_at = '2020-01-03 00:00:00';
      UPDATE sitemap_owner_revisions SET revised_at = '2020-01-03 00:00:00';
      UPDATE sitemap_profile_revisions SET revised_at = '2020-01-03 00:00:00';
    `);
  });

  it('hashes exactly the categories shard it serves when the family revision is newer', async () => {
    // The template triggers bump every sitemap_revisions kind on any public Template change.
    db.exec(`UPDATE sitemap_revisions SET revised_at = '2099-01-01 00:00:00'`);

    expectIndexMatchesShard(await buildBoth());
  });

  it('leaves /categories untouched when an uncategorized public Template is published', async () => {
    const before = await buildBoth();
    db.exec(`
      INSERT INTO templates VALUES ('t2', 'u1', 'user', NULL, 1, NULL,
        '2020-01-04 00:00:00', NULL, '[]', 'no-category');
    `);
    const after = await buildBoth();

    expect(after.shard).toBe(before.shard);
    expectIndexMatchesShard(after);
  });

  it('drops a category that loses its last public Template and advances the landing lastmod', async () => {
    const before = await buildBoth();
    expect(before.shard).toContain('https://serplists.com/categories/outdoor-gear');

    db.exec(`UPDATE templates SET is_public = 0 WHERE id = 't1'`);
    const after = await buildBoth();

    expect(after.shard).not.toContain('/categories/outdoor-gear');
    expect(after.landingLastmod! > before.landingLastmod!).toBe(true);
    expect(after.indexLastmod! > before.indexLastmod!).toBe(true);
    expectIndexMatchesShard(after);
  });

  it('lists a category page only when a public Template uses it', async () => {
    db.exec(`
      INSERT INTO templates VALUES ('t3', 'u1', 'user', NULL, 1, NULL,
        '2020-01-05 00:00:00', NULL, '["Engineering"]', 'engineering-list');
      INSERT INTO templates VALUES ('t4', 'u1', 'user', NULL, 0, NULL,
        '2020-01-05 00:00:00', NULL, '["Compliance"]', 'private-list');
    `);
    const { shard } = await buildBoth();
    const listed = Array.from(
      shard.matchAll(/<loc>https:\/\/serplists\.com\/categories\/([^<]+)<\/loc>/g),
      (match) => match[1],
    );
    const used = new Set(
      [...bundledCatalog.templates.flatMap((template) => template.categories), 'Outdoor Gear', 'Engineering']
        .map(categorySlug),
    );

    expect(listed.filter((slug) => slug === 'engineering')).toHaveLength(1);
    expect(listed.filter((slug) => !used.has(slug))).toEqual([]);
    for (const registered of PUBLIC_CATEGORY_REGISTRY.filter((category) => category.slug !== 'engineering')) {
      expect(listed).not.toContain(registered.slug);
    }
  });
});
