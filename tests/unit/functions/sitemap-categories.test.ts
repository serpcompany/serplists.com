import { sitemapRouteInTheWorker } from '../../support/sitemapRoutes';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { capturedGroup, lastOf, present } from '../../support/elements';
import type { StoredRow } from '../../support/d1Doubles';

import bundledCatalog from '../../../functions/sitemap/bundled-catalog.generated.json';
import { categorySlug } from '../../../functions/sitemap/shared';
import { PUBLIC_CATEGORY_REGISTRY } from '../../../src/data/publicCategories';
import { GET as sitemapIndexGet } from '@/app/sitemap.xml/route';
import { GET as categoriesShardGet } from '@/app/sitemaps/categories/[page]/route';
import { SqliteD1 } from '../../support/sqlite-d1';

const sitemapIndex = sitemapRouteInTheWorker(sitemapIndexGet);
const categoriesShard = sitemapRouteInTheWorker(categoriesShardGet);

let d1: SqliteD1;
let db: DatabaseSync;

async function get(handler: typeof sitemapIndex, path: string, params: { page?: string } = {}) {
  const response = await handler({
    request: new Request(`https://serplists.com${path}`),
    env: { DB: d1.binding },
    params,
  });
  expect(response.status, path).toBe(200);
  return response.text();
}

async function buildBoth() {
  const index = await get(sitemapIndex, '/sitemap.xml');
  const shard = await get(categoriesShard, '/sitemaps/categories/1.xml', { page: '1' });
  const indexLastmod = capturedGroup(index.match(
    /<loc>https:\/\/serplists\.com\/sitemaps\/categories\/1\.xml<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/,
  ), 1);
  const stored: StoredRow = present(db.prepare(
    `SELECT content_hash FROM sitemap_shard_revisions WHERE kind = 'categories' AND page = 1`,
  ).get(), 'the stored categories shard');
  const shardLastmods = Array.from(shard.matchAll(/<lastmod>([^<]+)<\/lastmod>/g), (match) => capturedGroup(match, 1)).sort();
  const landingLastmod = shard.match(
    /<loc>https:\/\/serplists\.com\/categories\/<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/,
  )?.[1];
  return { shard, indexLastmod, storedHash: stored.content_hash, shardLastmods, landingLastmod };
}

function expectIndexMatchesShard(result: Awaited<ReturnType<typeof buildBoth>>) {
  expect(createHash('sha256').update(result.shard).digest('hex')).toBe(result.storedHash);
  expect(result.indexLastmod >= lastOf(result.shardLastmods)).toBe(true);
}

describe('categories sitemap index and shard on SQLite with the real triggers, where the index hashes exactly the shard it serves', () => {
  beforeEach(() => {
    d1 = new SqliteD1({ schemaSql: [] });
    db = d1.sqlite;
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT, name TEXT, avatar_url TEXT, email TEXT,
        email_verified INTEGER, created_at TEXT NOT NULL, updated_at TEXT, auth_updated_at INTEGER
      );
      CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT, archived_at TEXT);
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

  it('hashes exactly the categories shard it serves when the family revision is newer, as any public Template change makes it', async () => {
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
    expect(before.shard).toContain('<loc>https://serplists.com/categories/outdoor-gear/</loc>');

    db.exec(`UPDATE templates SET is_public = 0 WHERE id = 't1'`);
    const after = await buildBoth();

    expect(after.shard).not.toContain('/categories/outdoor-gear');
    assert.exists(before.landingLastmod);
    assert.exists(after.landingLastmod);
    expect(after.landingLastmod > before.landingLastmod).toBe(true);
    expect(after.indexLastmod > before.indexLastmod).toBe(true);
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
      shard.matchAll(/<loc>https:\/\/serplists\.com\/categories\/([^<]+)\/<\/loc>/g),
      (match) => capturedGroup(match, 1),
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
