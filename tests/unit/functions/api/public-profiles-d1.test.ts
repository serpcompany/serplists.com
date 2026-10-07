import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sessionMocks } from '../../../support/mockedSession';

import { handleProfileByHandle } from '@functions/api/handlers/auth';
import { handleTemplates } from '@functions/api/handlers/templates';
import { apiEnvOn } from '../../../support/apiEnv';
import {
  ACME,
  ARCHIVED_ORGANIZATION,
  CREATOR,
  PERSONAL_OWNER,
  seedProfileOwners,
  storeProfileTemplate,
} from '../../../support/publicProfiles';
import { jsonObject, jsonObjects, readJson } from '../../../support/readJson';
import { SqliteD1 } from '../../../support/sqlite-d1';

let database: SqliteD1;

const profileOf = (handle: string) => {
  const url = new URL('http://localhost/api/profiles/by-handle');
  url.searchParams.set('handle', handle);
  return handleProfileByHandle(new Request(url), apiEnvOn(database));
};

const publicTemplatesOf = (query: string) =>
  handleTemplates(new Request(`http://localhost/api/templates/public?${query}`), apiEnvOn(database));

const listedIds = async (response: Response) => {
  expect(response.status).toBe(200);
  return (await readJson(response, jsonObjects)).map(({ id }) => id);
};

const EVERYTHING_PRIVATE_ABOUT_AN_ORGANIZATION = /org-1|member-1|billing|editor|creator-1@example\.test/;

beforeEach(() => {
  database = new SqliteD1();
  seedProfileOwners(database);
  sessionMocks.getSessionUserId.mockResolvedValue(null);
});

afterEach(() => {
  database.close();
});

describe('GET /api/profiles/by-handle, which resolves a handle through the public handle registry', () => {
  it.each(['bob', 'BOB', '  Bob  '])("answers the User a handle names, in any letter case, as the username lookup did (%j)", async (typed) => {
    const response = await profileOf(typed);

    expect(response.status).toBe(200);
    expect(await readJson(response, jsonObject)).toEqual({
      type: 'user',
      id: PERSONAL_OWNER.id,
      username: PERSONAL_OWNER.username,
      full_name: PERSONAL_OWNER.name,
      avatar_url: null,
      created_at: '2026-01-01 00:00:00',
    });
  });

  it("answers an active Organization's handle with its name, handle, avatar and description, and nothing else", async () => {
    const response = await profileOf('acme-launch');
    const sent = await response.clone().text();

    expect(response.status).toBe(200);
    expect(await readJson(response, jsonObject)).toEqual({
      type: 'team',
      handle: ACME.handle,
      name: ACME.name,
      avatar_url: ACME.avatarUrl,
      description: ACME.description,
    });
    expect(sent).not.toMatch(EVERYTHING_PRIVATE_ABOUT_AN_ORGANIZATION);
  });

  it('answers 404 for an archived Organization, which keeps its handle but has no public page', async () => {
    expect(database.rows('SELECT owner_id FROM public_handles WHERE handle = ?', ARCHIVED_ORGANIZATION.handle)).toHaveLength(1);

    expect((await profileOf(ARCHIVED_ORGANIZATION.handle)).status).toBe(404);
  });

  it('answers 404 for a handle no one holds and 400 for a blank one', async () => {
    expect((await profileOf('nobody-here')).status).toBe(404);
    expect((await profileOf('   ')).status).toBe(400);
  });

  it('reads the registry and the owner by their primary keys, never scanning a table', async () => {
    await profileOf('acme-launch');

    const lookup = database.queries.find(({ sql }) => sql.includes('"public_handles"'));
    assert.exists(lookup);
    const plan = database.queryPlan(lookup).join('\n');
    expect(plan).toMatch(/SEARCH public_handles USING INDEX sqlite_autoindex_public_handles_1 \(handle=\?\)/);
    expect(plan).toMatch(/SEARCH teams USING INDEX sqlite_autoindex_teams_1 \(id=\?\)/);
    expect(plan).not.toMatch(/SCAN/);
  });
});

describe('GET /api/templates/public?handle=, the public Templates of the Profile Owner a handle names', () => {
  beforeEach(() => {
    storeProfileTemplate(database, { id: 'org-public', ownerType: 'team', createdAt: '2026-02-03' });
    storeProfileTemplate(database, { id: 'org-older', ownerType: 'team', createdAt: '2026-02-02' });
    storeProfileTemplate(database, { id: 'org-private', ownerType: 'team', isPublic: false });
    storeProfileTemplate(database, { id: 'org-deleted', ownerType: 'team', deletedAt: '2026-03-01' });
    storeProfileTemplate(database, { id: 'archived-org-public', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });
    storeProfileTemplate(database, { id: 'creator-personal', userId: CREATOR.id });
    storeProfileTemplate(database, { id: 'bob-personal' });
  });

  it("lists an Organization's public, live Templates, newest first, and none of its Creator's or other owners'", async () => {
    expect(await listedIds(await publicTemplatesOf('handle=ACME-LAUNCH'))).toEqual(['org-public', 'org-older']);
  });

  it('names the Organization by its handle and name, never its id, members or private Templates', async () => {
    const response = await publicTemplatesOf('handle=acme-launch');
    const sent = await response.clone().text();
    const [template] = await readJson(response, jsonObjects);

    expect(template?.['owner']).toEqual({ type: 'team', publicHandle: ACME.handle, displayName: ACME.name });
    expect(template).not.toHaveProperty('team_id');
    expect(sent).not.toMatch(/org-private|org-deleted|org-1"/);
  });

  it("lists a User's public Personal Templates by their handle, as by their id", async () => {
    expect(await listedIds(await publicTemplatesOf('handle=alice'))).toEqual(['creator-personal']);
    expect(await listedIds(await publicTemplatesOf(`userId=${CREATOR.id}`))).toEqual(['creator-personal']);
  });

  it('answers 404 for an archived Organization and a handle no one holds, and 400 without a userId or handle', async () => {
    expect((await publicTemplatesOf(`handle=${ARCHIVED_ORGANIZATION.handle}`)).status).toBe(404);
    expect((await publicTemplatesOf('handle=nobody-here')).status).toBe(404);
    expect((await publicTemplatesOf('')).status).toBe(400);
  });
});

describe('the public owner of an Organization Template elsewhere in public responses', () => {
  const ownersInTheCatalog = async () => {
    const response = await handleTemplates(new Request('http://localhost/api/templates?scope=public'), apiEnvOn(database));
    const catalog = await readJson(response, z.array(z.object({ id: z.string(), owner: z.unknown() }).passthrough()));
    return Object.fromEntries(catalog.map(({ id, owner }) => [id, owner]));
  };

  it('names an active Organization with a handle, and only says an Organization owns it once the Organization is archived', async () => {
    storeProfileTemplate(database, { id: 'org-public', ownerType: 'team' });
    storeProfileTemplate(database, { id: 'archived-org-public', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });

    expect(await ownersInTheCatalog()).toEqual({
      'org-public': { type: 'team', publicHandle: ACME.handle, displayName: ACME.name },
      'archived-org-public': { type: 'team' },
    });
  });

  it('only says an Organization owns it while the Organization has no handle', async () => {
    database.run('UPDATE teams SET slug = NULL WHERE id = ?', ACME.id);
    storeProfileTemplate(database, { id: 'org-public', ownerType: 'team' });

    expect(await ownersInTheCatalog()).toEqual({ 'org-public': { type: 'team' } });
  });
});
