import { assert, beforeEach, describe, expect, it } from 'vitest';

import { loadPublicTemplate } from '../../../functions/seo/public-template-lookup';
import { SqliteD1 } from '../../support/sqlite-d1';
import { apiEnv } from '../../support/apiEnv';
import { ACME, ARCHIVED_ORGANIZATION, seedProfileOwners, storeProfileTemplate } from '../../support/publicProfiles';

const UUID_SLUG = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const TEMPLATE_ID = '9b2d7c1e-0f3a-4e5b-8c6d-7a8b9c0d1e2f';

let d1: SqliteD1;

const insertTemplate = (id: string, slug: string, isPublic = true) =>
  d1.run(
    `INSERT INTO templates (id, user_id, title, items, slug, is_public, created_at, owner_type, category)
     VALUES (?, 'user-1', ?, '[]', ?, ?, '2026-01-01', 'user', '["Planning"]')`,
    id,
    `Template ${slug}`,
    slug,
    isPublic ? 1 : 0,
  );

const lookup = (identifier: string) =>
  loadPublicTemplate(apiEnv({ DB: d1.binding }), 'https://serplists.com', identifier);

describe('public template lookup for a UUID-shaped identifier, which like the page tries the id and then a slug saved before UUID slugs were refused', () => {
  beforeEach(() => {
    d1 = new SqliteD1();
    d1.run(
      `INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
       VALUES ('user-1', 'alice@example.test', 'Alice', 'alice', 1, '2026-01-01', '2026-01-01')`,
    );
  });

  it('finds a public template whose slug looks like an id', async () => {
    insertTemplate(TEMPLATE_ID, UUID_SLUG);

    const record = await lookup(UUID_SLUG);

    expect(record).toMatchObject({ id: TEMPLATE_ID, slug: UUID_SLUG, ownerHandle: 'alice' });
  });

  it('reads what the page names in its tags: the creation date and the categories', async () => {
    insertTemplate(TEMPLATE_ID, 'weekly-review');

    const record = await lookup('weekly-review');

    expect(record).toMatchObject({ createdAt: '2026-01-01', categories: ['Planning'] });
  });

  it('reads the template with that id first, with one query', async () => {
    insertTemplate(TEMPLATE_ID, 'weekly-review');
    insertTemplate('0e6c8b4a-1f2d-4c3b-9a8e-7d6c5b4a3f2e', TEMPLATE_ID);

    const record = await lookup(TEMPLATE_ID);

    expect(record).toMatchObject({ id: TEMPLATE_ID, slug: 'weekly-review' });
    expect(d1.queries).toHaveLength(1);
  });

  it('keeps both lookups on an index', async () => {
    insertTemplate(TEMPLATE_ID, UUID_SLUG);

    await lookup(UUID_SLUG);

    expect(d1.queries).toHaveLength(2);
    for (const query of d1.queries) {
      const plan = d1.queryPlan(query).join('\n');
      expect(plan).not.toMatch(/SCAN templates/);
      expect(plan).toMatch(/SEARCH templates USING INDEX (sqlite_autoindex_templates_1|idx_templates_slug_unique)/);
    }
  });

  it('finds nothing for a private template or a missing one', async () => {
    insertTemplate(TEMPLATE_ID, UUID_SLUG, false);

    expect(await lookup(UUID_SLUG)).toBeNull();
    expect(await lookup('7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d')).toBeNull();
  });
});

describe("public template lookup naming the Template Owner's handle, which public Template URLs live under", () => {
  beforeEach(() => {
    d1 = new SqliteD1();
    seedProfileOwners(d1);
  });

  it("names an Organization Template's Organization as its owner, and its Creator only for the URL it used to live at", async () => {
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });

    expect(await lookup('launch-plan')).toMatchObject({
      id: 'launch-plan',
      ownerHandle: ACME.handle,
      isOrganizationTemplate: true,
      creatorUsername: 'alice',
    });
  });

  it('names no owner for an Organization Template once its Organization is archived or has no handle', async () => {
    storeProfileTemplate(d1, { id: 'archived-plan', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });
    d1.run("UPDATE teams SET slug = '  ' WHERE id = ?", ACME.id);
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });

    expect(await lookup('archived-plan')).toMatchObject({ ownerHandle: null });
    expect(await lookup('launch-plan')).toMatchObject({ ownerHandle: null });
  });

  it("names a Personal Template's User, as before", async () => {
    storeProfileTemplate(d1, { id: 'bob-plan' });

    expect(await lookup('bob-plan')).toMatchObject({ ownerHandle: 'bob', isOrganizationTemplate: false });
  });

  it('reads the owning Organization by its primary key', async () => {
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });

    await lookup('launch-plan');

    const query = d1.queries.at(-1);
    assert.exists(query);
    const plan = d1.queryPlan(query).join('\n');
    expect(plan).toContain('SEARCH teams USING INDEX sqlite_autoindex_teams_1 (id=?) LEFT-JOIN');
    expect(plan).not.toMatch(/SCAN/);
  });
});
