import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serveTemplatesSitemap } from '../../../functions/sitemap/routes';
import { ACME, ARCHIVED_ORGANIZATION, seedProfileOwners, storeProfileTemplate } from '../../support/publicProfiles';
import { sitemapLocations } from '../../support/sitemapLocations';
import { SqliteD1 } from '../../support/sqlite-d1';

let d1: SqliteD1;

async function templateLocations(): Promise<string[]> {
  return (await sitemapLocations(d1, serveTemplatesSitemap, '/sitemaps/templates/1.xml'))
    .filter((path) => path.startsWith('/profile/') && !path.startsWith('/profile/serp/'));
}

beforeEach(() => {
  d1 = new SqliteD1();
  seedProfileOwners(d1);
});

afterEach(() => {
  d1.close();
});

describe("the templates sitemap, which lists each public Template at its Template Owner's URL", () => {
  it("lists a public Organization Template under its Organization's handle, never its Creator's username", async () => {
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });
    storeProfileTemplate(d1, { id: 'bob-plan' });

    expect((await templateLocations()).sort()).toEqual([`/profile/${ACME.handle}/launch-plan/`, '/profile/bob/bob-plan/']);
  });

  it('leaves out an Organization Template that is private or deleted, or whose Organization is archived or has no valid handle', async () => {
    storeProfileTemplate(d1, { id: 'private-plan', ownerType: 'team', isPublic: false });
    storeProfileTemplate(d1, { id: 'deleted-plan', ownerType: 'team', deletedAt: '2026-03-01' });
    storeProfileTemplate(d1, { id: 'archived-plan', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });

    expect(await templateLocations()).toEqual([]);

    d1.run("UPDATE teams SET slug = 'not a handle' WHERE id = ?", ACME.id);
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });

    expect(await templateLocations()).toEqual([]);
  });
});
