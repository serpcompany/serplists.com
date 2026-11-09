import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { serveProfilesSitemap, serveSitemapIndex, serveTemplatesSitemap } from '../../../functions/sitemap/routes';
import { apiEnv } from '../../support/apiEnv';
import { sitemapLocations } from '../../support/sitemapLocations';
import { SqliteD1 } from '../../support/sqlite-d1';

vi.mock('../../../functions/sitemap/listedOwners', () => ({
  validUsernameCondition: sql`1 = 1`,
  validOrganizationHandleCondition: sql`1 = 1`,
  listedOrganizationCondition: sql`1 = 1`,
}));

vi.mock('../../../functions/sitemap/shared', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../functions/sitemap/shared')>(),
  validTemplateSlugCondition: sql`1 = 1`,
}));

let d1: SqliteD1;

const addUser = (id: string, username: string | null) =>
  d1.run(
    `INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES (?, ?, 'Owner', ?, 1, '2026-02-03 04:05:06')`,
    id,
    `${id}@example.test`,
    username,
  );

const addTemplate = (id: string, userId: string, slug: string | null) =>
  d1.run(
    `INSERT INTO templates (id, user_id, title, items, slug, is_public, created_at, owner_type)
     VALUES (?, ?, 'Launch', '[]', ?, 1, '2026-03-04 05:06:07', 'user')`,
    id,
    userId,
    slug,
  );

beforeEach(() => {
  d1 = new SqliteD1();
});

afterEach(() => {
  d1.close();
});

describe("the sitemaps check each handle and slug again, even when the database's filter lets one through", () => {
  it('lists a profile under its handle without the spaces around it, and leaves out one with no handle or one that is not a public handle', async () => {
    addUser('carol', '  carol  ');
    addUser('nameless', null);
    addUser('spaced', 'jane doe');

    expect(await sitemapLocations(d1, serveProfilesSitemap, '/sitemaps/profiles/1.xml')).toEqual(['/profile/carol/']);
  });

  it('lists a template under its slug without the spaces around it, and leaves out one with no slug, a bad slug or an owner with no handle', async () => {
    addUser('alice', 'alice');
    addUser('nameless', null);
    addTemplate('t-spaced', 'alice', '  ship-it  ');
    addTemplate('t-no-slug', 'alice', null);
    addTemplate('t-bad-slug', 'alice', 'Ship It');
    addTemplate('t-no-owner-handle', 'nameless', 'launch');

    const locations = await sitemapLocations(d1, serveTemplatesSitemap, '/sitemaps/templates/1.xml');

    expect(locations.filter((location) => location.startsWith('/profile/') && !location.startsWith('/profile/serp/')))
      .toEqual(['/profile/alice/ship-it/']);
  });

  it('builds the index from the same checked entries, so a profile that fails the check leaves the profiles shard as if it were not there', async () => {
    const profilesShardHashWith = async (...usernames: string[]) => {
      d1.close();
      d1 = new SqliteD1();
      usernames.forEach((username, index) => addUser(`user-${index}`, username));
      await serveSitemapIndex({ request: new Request('https://serplists.com/sitemap.xml'), env: apiEnv({ DB: d1.binding }), waitUntil: () => undefined });
      return d1.rows("SELECT content_hash FROM sitemap_shard_revisions WHERE kind = 'profiles'");
    };

    const withoutAnyone = await profilesShardHashWith();

    expect(await profilesShardHashWith('jane doe')).toEqual(withoutAnyone);
    expect(await profilesShardHashWith('jane')).not.toEqual(withoutAnyone);
  });
});
