import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleProfileDirectory } from '../../../functions/api/handlers/profile-directory';
import { serveProfilesSitemap } from '../../../functions/sitemap/routes';
import { profileDirectoryPageSchema } from '@/lib/schemas/profileDirectory';
import { apiEnvOn } from '../../support/apiEnv';
import { ACME, ARCHIVED_ORGANIZATION, CREATOR, PERSONAL_OWNER, seedProfileOwners } from '../../support/publicProfiles';
import { readSuccessfulJson } from '../../support/readJson';
import { sitemapEntries, sitemapLocations } from '../../support/sitemapLocations';
import { SqliteD1 } from '../../support/sqlite-d1';

let d1: SqliteD1;

const profileLocations = () => sitemapLocations(d1, serveProfilesSitemap, '/sitemaps/profiles/1.xml');

const pathOf = (handle: string) => `/profile/${handle}/`;

async function directoryPaths(collection: 'people' | 'organizations'): Promise<string[]> {
  const paths: string[] = [];
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ collection, ...(after ? { after } : {}) });
    const response = await handleProfileDirectory(new Request(`http://localhost/api/profiles?${query.toString()}`), apiEnvOn(d1));
    const page = await readSuccessfulJson(response, profileDirectoryPageSchema);
    paths.push(...page.profiles.map(({ handle }) => pathOf(handle)));
    after = page.next_cursor;
  } while (after);
  return paths;
}

beforeEach(() => {
  d1 = new SqliteD1();
  seedProfileOwners(d1);
});

afterEach(() => {
  d1.close();
});

describe('the profiles sitemap, which lists every Profile Owner with a public profile', () => {
  it("lists each active Organization with a valid handle after every User, whose entries stay as they were", async () => {
    d1.run("INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES ('org-0', 'First', 'first-org', ?, '2026-01-03')", CREATOR.id);

    expect(await profileLocations()).toEqual([
      pathOf(CREATOR.username),
      pathOf(PERSONAL_OWNER.username),
      pathOf('first-org'),
      pathOf(ACME.handle),
    ]);
  });

  it("dates an Organization's entry by its last update, else its creation", async () => {
    d1.run("UPDATE teams SET updated_at = '2026-05-06T07:08:09.000Z' WHERE id = ?", ACME.id);
    d1.run("INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES ('org-0', 'First', 'first-org', ?, '2026-01-03')", CREATOR.id);
    const lastmods = Object.fromEntries((await sitemapEntries(d1, serveProfilesSitemap, '/sitemaps/profiles/1.xml')).map(({ loc, lastmod }) => [loc, lastmod]));

    expect(lastmods[pathOf(ACME.handle)]).toBe('2026-05-06T07:08:09.000Z');
    expect(lastmods[pathOf('first-org')]).toBe('2026-01-03T00:00:00.000Z');
  });

  it('drops an Organization once it is archived or its handle is cleared or no longer passes the rule', async () => {
    expect(await profileLocations()).not.toContain(pathOf(ARCHIVED_ORGANIZATION.handle));

    for (const change of ["UPDATE teams SET archived_at = '2026-05-01' WHERE id = ?", 'UPDATE teams SET slug = NULL WHERE id = ?']) {
      d1.run('UPDATE teams SET archived_at = NULL, slug = ? WHERE id = ?', ACME.handle, ACME.id);
      d1.run(change, ACME.id);
      expect(await profileLocations(), change).toEqual([pathOf(CREATOR.username), pathOf(PERSONAL_OWNER.username)]);
    }
  });

  it('lists exactly the owners the profile directory lists, since both apply one eligibility rule in SQL', async () => {
    for (const [id, username] of [['spaced', 'jane doe'], ['short', 'ab'], ['hyphen', 'jane-doe'], ['none', null]] as const) {
      d1.run("INSERT INTO users (id, email, username, created_at) VALUES (?, ?, ?, '2026-01-02')", id, `${id}@example.test`, username);
    }
    for (const [id, slug] of [['no-slug', null], ['bad-slug', 'not a handle'], ['zeta', 'zeta-org']] as const) {
      d1.run("INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES (?, ?, ?, ?, '2026-01-02')", id, id, slug, CREATOR.id);
    }

    const listedByTheDirectory = [...(await directoryPaths('people')), ...(await directoryPaths('organizations'))];
    expect([...(await profileLocations())].sort()).toEqual([...listedByTheDirectory].sort());
  });
});
