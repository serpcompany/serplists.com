import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as legacyCategoriesSitemapRoute from '@/app/(site)/categories/sitemap.xml/route';
import * as pagesSitemapRoute from '@/app/sitemaps/pages/[page]/route';
import * as legacyStaticSitemapRoute from '@/app/sitemaps/static.xml/route';
import { serveProfilesSitemap, serveSitemapIndex, serveTemplatesSitemap } from '../../../functions/sitemap/routes';
import {
  SITEMAP_PAGE_SIZE,
  handlePagedDatabaseSitemap,
  mostRecentLastmod,
  parseCategories,
  parsePage,
  planDurableShardIndex,
} from '../../../functions/sitemap/shared';
import { apiEnv } from '../../support/apiEnv';
import { sitemapEntries } from '../../support/sitemapLocations';
import { SqliteD1 } from '../../support/sqlite-d1';

let d1: SqliteD1;

beforeEach(() => {
  d1 = new SqliteD1();
});

afterEach(() => {
  d1.close();
});

const addUser = (id: string, username: string, updatedAt: string | null) =>
  d1.run(
    `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
     VALUES (?, ?, 'Owner', ?, 1, '2026-02-03 04:05:06', ?)`,
    id,
    `${id}@example.test`,
    username,
    updatedAt,
  );

const lastmodOf = async (serve: typeof serveProfilesSitemap, path: string, loc: string) =>
  (await sitemapEntries(d1, serve, path)).find((entry) => entry.loc === loc)?.lastmod;

const shardRequest = (path: string, method = 'GET') =>
  new Request(`https://serplists.com${path}`, { method });

describe('the pages sitemap shards', () => {
  it('answers 404 for a shard file name that is not a page number, and for a page past the last', async () => {
    const notANumber = await pagesSitemapRoute.GET(shardRequest('/sitemaps/pages/latest.xml'), {
      params: Promise.resolve({ page: 'latest.xml' }),
    });
    const pastTheLast = await pagesSitemapRoute.GET(shardRequest('/sitemaps/pages/2.xml'), {
      params: Promise.resolve({ page: '2.xml' }),
    });

    expect(notANumber.status).toBe(404);
    expect(pastTheLast.status).toBe(404);
    expect(await pastTheLast.text()).not.toContain('<url>');
  });

  it('refuses a method other than GET or HEAD on the obsolete sitemap addresses too', async () => {
    for (const route of [legacyStaticSitemapRoute, legacyCategoriesSitemapRoute]) {
      const response = await route.GET(shardRequest('/sitemaps/static.xml', 'POST'));

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    }
  });
});

describe('the database sitemap shards', () => {
  it("dates a profile that was never updated, and has no recorded revision, by its creation", async () => {
    addUser('user-1', 'alice', null);
    d1.run('DELETE FROM sitemap_profile_revisions');

    expect(await lastmodOf(serveProfilesSitemap, '/sitemaps/profiles/1.xml', '/profile/alice/')).toBe('2026-02-03T04:05:06.000Z');
  });

  it('dates a template that was never updated by its creation', async () => {
    addUser('user-1', 'alice', '2026-01-01 00:00:00');
    d1.run(
      `INSERT INTO templates (id, user_id, title, items, slug, is_public, created_at, updated_at, owner_type)
       VALUES ('t-1', 'user-1', 'Launch', '[]', 'launch', 1, '2026-03-04 05:06:07', NULL, 'user')`,
    );

    expect(await lastmodOf(serveTemplatesSitemap, '/sitemaps/templates/1.xml', '/profile/alice/launch/')).toBe(
      '2026-03-04T05:06:07.000Z',
    );
  });

  it('lists the Organizations that spill past the people onto the second profiles shard', async () => {
    addUser('user-1', 'alice', null);
    d1.run(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO teams (id, name, slug, created_by_user_id, created_at)
       SELECT printf('org-%06d', i), 'Org', printf('org-%06d', i), 'user-1', '2026-01-01' FROM n`,
      SITEMAP_PAGE_SIZE + 1,
    );
    d1.run(
      `INSERT INTO sitemap_shard_revisions (kind, page, content_hash, revised_at) VALUES ('profiles', 2, 'hash', '2026-01-01T00:00:00.000Z')`,
    );

    const response = await serveProfilesSitemap(
      { request: shardRequest('/sitemaps/profiles/2.xml'), env: apiEnv({ DB: d1.binding }), waitUntil: () => undefined },
      '2',
    );
    const locations = Array.from((await response.text()).matchAll(/<loc>https:\/\/serplists\.com([^<]*)<\/loc>/g), (match) => match[1]);

    expect(locations).toEqual(['/profile/org-025000/', '/profile/org-025001/']);
  });
});

describe('the sitemap index shard revisions', () => {
  it('forgets a shard the sitemap no longer has, so the index stops naming it', async () => {
    addUser('user-1', 'alice', null);
    d1.run(
      `INSERT INTO sitemap_shard_revisions (kind, page, content_hash, revised_at) VALUES ('profiles', 7, 'old', '2026-01-01T00:00:00.000Z')`,
    );

    const index = await serveSitemapIndex({ request: shardRequest('/sitemap.xml'), env: apiEnv({ DB: d1.binding }), waitUntil: () => undefined });

    expect(await index.text()).not.toContain('/sitemaps/profiles/7.xml');
    expect(d1.rows("SELECT page FROM sitemap_shard_revisions WHERE kind = 'profiles'")).toEqual([{ page: 1 }]);
  });

  it('refuses to date a shard when neither its family nor its entries carry a date', async () => {
    await expect(planDurableShardIndex('profiles', [{ path: '/profile/alice/' }], [], null)).rejects.toThrow(
      'Missing revision source for profiles sitemap shard 1',
    );
  });
});

describe('sitemap dates and categories', () => {
  it('has no most recent date when none of the dates can be read', () => {
    expect(mostRecentLastmod(null, undefined, 'not a date')).toBeNull();
  });

  it('reads no categories from a value that is not text or is blank', () => {
    expect(parseCategories(null)).toEqual([]);
    expect(parseCategories('   ')).toEqual([]);
    expect(parseCategories('Travel')).toEqual(['Travel']);
  });
});

describe('the page a sitemap shard is asked for', () => {
  it('reads the first of several values, and no page from none', () => {
    expect(parsePage(['2', '3'])).toBe(2);
    expect(parsePage([])).toBeNull();
    expect(parsePage(undefined)).toBeNull();
  });
});

describe('a database sitemap shard', () => {
  const shard = (method: string, prefixEntries: { path: string }[] = []) => {
    const loadRows = vi.fn(async () => [{ path: '/profile/alice/' }]);
    const response = handlePagedDatabaseSitemap({
      request: shardRequest('/sitemaps/profiles/1.xml', method),
      params: { page: '1' },
      loadRows,
      toEntry: (row) => row,
      prefixEntries,
    });
    return { response, loadRows };
  };

  it('refuses a method other than GET or HEAD without reading the database', async () => {
    const { response, loadRows } = shard('POST');

    expect((await response).status).toBe(405);
    expect(loadRows).not.toHaveBeenCalled();
  });

  it('reads no database rows for a page its leading entries fill', async () => {
    const leading = Array.from({ length: SITEMAP_PAGE_SIZE }, (_, index) => ({ path: `/templates/${index}/` }));
    const { response, loadRows } = shard('GET', leading);

    expect(await (await response).text()).not.toContain('/profile/alice/');
    expect(loadRows).not.toHaveBeenCalled();
  });
});
