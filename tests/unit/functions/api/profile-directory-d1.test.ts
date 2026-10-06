import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleProfileDirectory } from '@functions/api/handlers/profile-directory';
import { PROFILE_DIRECTORY_PAGE_SIZE, profileDirectoryPageSchema } from '@/lib/schemas/profileDirectory';
import { apiEnvOn } from '../../../support/apiEnv';
import {
  ACME,
  ARCHIVED_ORGANIZATION,
  CREATOR,
  PERSONAL_OWNER,
  seedProfileOwners,
  storeProfileTemplate,
} from '../../../support/publicProfiles';
import { apiErrorBody, readJson, readSuccessfulJson } from '../../../support/readJson';
import { SqliteD1 } from '../../../support/sqlite-d1';

let database: SqliteD1;

const directory = (query = '', method = 'GET') =>
  handleProfileDirectory(new Request(`http://localhost/api/profiles${query}`, { method }), apiEnvOn(database));

const pageOf = async (query = '') => readSuccessfulJson(await directory(query), profileDirectoryPageSchema);

const handlesOf = async (query = '') => (await pageOf(query)).profiles.map(({ handle }) => handle);

const addUser = (id: string, username: string | null, name: string | null = null) =>
  database.run(
    "INSERT INTO users (id, email, name, username, created_at) VALUES (?, ?, ?, ?, '2026-01-02 00:00:00')",
    id,
    `${id}@example.test`,
    name,
    username,
  );

const addOrganization = (id: string, slug: string | null) =>
  database.run(
    "INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES (?, ?, ?, ?, '2026-01-02')",
    id,
    `Organization ${id}`,
    slug,
    CREATOR.id,
  );

const EVERYTHING_PRIVATE = /"(?:creator-1|owner-2|org-1|org-archived|member-1)"|@example\.test|editor|billing|"email"|"role"/;

beforeEach(() => {
  database = new SqliteD1();
  seedProfileOwners(database);
});

afterEach(() => {
  database.close();
});

describe('GET /api/profiles, the People collection of the profile directory', () => {
  it('lists every User whose username passes the public handle rule, by username, as the profiles sitemap does', async () => {
    addUser('spaced', 'jane doe');
    addUser('short', 'ab');
    addUser('private', null);
    addUser('hyphen', 'jane-doe', 'Jane Doe');

    expect(await handlesOf()).toEqual([CREATOR.username, PERSONAL_OWNER.username, 'jane-doe']);
    expect(await handlesOf('?collection=people')).toEqual([CREATOR.username, PERSONAL_OWNER.username, 'jane-doe']);
  });

  it("shows each one's name, avatar and public Template count, and nothing private", async () => {
    database.run("UPDATE users SET avatar_url = 'https://serplists.com/bob.webp' WHERE id = ?", PERSONAL_OWNER.id);
    storeProfileTemplate(database, { id: 'bob-public' });
    storeProfileTemplate(database, { id: 'bob-older', createdAt: '2026-01-15' });
    storeProfileTemplate(database, { id: 'bob-private', isPublic: false });
    storeProfileTemplate(database, { id: 'bob-deleted', deletedAt: '2026-03-01' });
    storeProfileTemplate(database, { id: 'org-made-by-alice', ownerType: 'team' });
    const response = await directory();
    const sent = await response.clone().text();

    expect((await readSuccessfulJson(response, profileDirectoryPageSchema)).profiles).toEqual([
      { handle: CREATOR.username, name: CREATOR.name, avatar_url: null, public_template_count: 0 },
      { handle: PERSONAL_OWNER.username, name: PERSONAL_OWNER.name, avatar_url: 'https://serplists.com/bob.webp', public_template_count: 2 },
    ]);
    expect(sent).not.toMatch(EVERYTHING_PRIVATE);
  });
});

describe('GET /api/profiles?collection=organizations, the Organizations collection', () => {
  it('lists each active Organization with a handle that passes the rule, and none archived or without one', async () => {
    addOrganization('no-slug', null);
    addOrganization('bad-slug', 'not a handle');
    addOrganization('zeta', 'zeta-org');

    expect(await handlesOf('?collection=organizations')).toEqual([ACME.handle, 'zeta-org']);
    expect(await handlesOf('?collection=organizations')).not.toContain(ARCHIVED_ORGANIZATION.handle);
  });

  it("shows its name, avatar and public Template count, and never its id, members, roles or billing", async () => {
    storeProfileTemplate(database, { id: 'org-public', ownerType: 'team' });
    storeProfileTemplate(database, { id: 'org-private', ownerType: 'team', isPublic: false });
    storeProfileTemplate(database, { id: 'archived-org-public', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });
    storeProfileTemplate(database, { id: 'alice-personal', userId: CREATOR.id });
    const response = await directory('?collection=organizations');
    const sent = await response.clone().text();

    expect((await readSuccessfulJson(response, profileDirectoryPageSchema)).profiles).toEqual([
      { handle: ACME.handle, name: ACME.name, avatar_url: ACME.avatarUrl, public_template_count: 1 },
    ]);
    expect(sent).not.toMatch(EVERYTHING_PRIVATE);
  });
});

describe('pages of the profile directory', () => {
  const usernames = Array.from({ length: PROFILE_DIRECTORY_PAGE_SIZE + 5 }, (_, index) => `user_${String(index).padStart(2, '0')}`);

  beforeEach(() => {
    [...usernames].reverse().forEach((username) => addUser(`id-${username}`, username));
  });

  it('pages in a stable order with a cursor, forwards and back', async () => {
    const everyone = [CREATOR.username, PERSONAL_OWNER.username, ...usernames].sort();
    const first = await pageOf();

    expect(first.profiles.map(({ handle }) => handle)).toEqual(everyone.slice(0, PROFILE_DIRECTORY_PAGE_SIZE));
    expect(first.previous_cursor).toBeNull();
    expect(first.next_cursor).toBe(everyone[PROFILE_DIRECTORY_PAGE_SIZE - 1]);

    const second = await pageOf(`?after=${first.next_cursor}`);
    expect(second.profiles.map(({ handle }) => handle)).toEqual(everyone.slice(PROFILE_DIRECTORY_PAGE_SIZE));
    expect(second.next_cursor).toBeNull();
    expect(second.previous_cursor).toBe(everyone[PROFILE_DIRECTORY_PAGE_SIZE]);

    const back = await pageOf(`?before=${second.previous_cursor}`);
    expect(back.profiles).toEqual(first.profiles);
    expect(back.previous_cursor).toBeNull();
    expect(back.next_cursor).toBe(first.next_cursor);
  });

  it('counts the public Templates of a whole page in one grouped query, with no query per card', async () => {
    database.queries.splice(0);
    await pageOf();

    expect(database.queries).toHaveLength(2);
    expect(database.queries[1]?.sql).toMatch(/group by/i);
  });

  it('reads each collection in order from the handle indexes and counts through the owner indexes, never every public Template', async () => {
    const plans: string[] = [];
    for (const query of ['', '?after=user_05', '?before=user_20', '?collection=organizations', '?collection=organizations&after=a']) {
      database.queries.splice(0);
      await pageOf(query);
      plans.push(...database.queries.map((recorded) => database.queryPlan(recorded).join('; ')));
    }

    expect(plans.filter((plan) => plan.includes('USING INDEX idx_users_username'))).toHaveLength(3);
    expect(plans.filter((plan) => plan.includes('USING INDEX idx_teams_slug_unique'))).toHaveLength(2);
    expect(plans.filter((plan) => plan.includes('USING INDEX idx_templates_owner'))).toHaveLength(3);
    expect(plans.filter((plan) => plan.includes('USING INDEX idx_templates_team_id'))).toHaveLength(1);
    for (const plan of plans) {
      expect(plan).not.toMatch(/SCAN|TEMP B-TREE FOR ORDER BY|idx_templates_public_created_at/);
    }
  });
});

describe('the inputs GET /api/profiles accepts', () => {
  it.each([
    ['a collection it does not have', '?collection=teams'],
    ['both cursors', '?after=a&before=b'],
    ['a cursor longer than any handle', `?after=${'a'.repeat(65)}`],
  ])('refuses %s with 400', async (_, query) => {
    const response = await directory(query);

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toBeTruthy();
  });

  it('ignores parameters it does not know and an empty cursor', async () => {
    expect(await handlesOf('?page=9&after=&utm_source=x')).toEqual([CREATOR.username, PERSONAL_OWNER.username]);
  });

  it('answers only GET', async () => {
    expect((await directory('', 'POST')).status).toBe(405);
  });
});
