import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACME, ARCHIVED_ORGANIZATION, CREATOR, PERSONAL_OWNER, seedProfileOwners, storeProfileTemplate } from '../../support/publicProfiles';
import { readMigration, SqliteD1 } from '../../support/sqlite-d1';

const LONG_AGO = '2000-01-01 00:00:00.000';
const MIGRATION_0032 = '0032_sitemap_organization_revisions.sql';
const TEMPLATE_FAMILIES = ['categories', 'templates'];
const EVERY_FAMILY = ['categories', 'profiles', 'templates'];

let d1: SqliteD1;

const revisedSince = (table: string, column: string): string[] =>
  d1.rows<{ value: string }>(`SELECT ${column} AS value FROM ${table} WHERE revised_at > ? ORDER BY ${column}`, LONG_AGO)
    .map(({ value }) => value);

function resetRevisions() {
  for (const table of ['sitemap_revisions', 'sitemap_profile_revisions', 'sitemap_category_revisions']) {
    d1.run(`UPDATE ${table} SET revised_at = ?`, LONG_AGO);
  }
}

function bumpedBy(write: string | (() => void), ...params: unknown[]): string[] {
  resetRevisions();
  if (typeof write === 'string') d1.run(write, ...params);
  else write();
  return revisedSince('sitemap_revisions', 'kind');
}

const addOrganization = (id: string, slug: string | null) =>
  d1.run(
    `INSERT INTO teams (id, name, slug, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-04-01', '2026-04-01')`,
    id,
    `Organization ${id}`,
    slug,
    CREATOR.id,
  );

describe('the sitemap triggers after 0032, for public Organization Templates (TD-23)', () => {
  beforeEach(() => {
    d1 = new SqliteD1();
    seedProfileOwners(d1);
  });

  afterEach(() => {
    d1.close();
  });

  it("refresh the templates and categories sitemaps when one is published, edited, unpublished or deleted, and no User's profile", () => {
    expect(bumpedBy(() => storeProfileTemplate(d1, { id: 'launch', ownerType: 'team', category: '["Procurement"]' }))).toEqual(TEMPLATE_FAMILIES);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual(['["Procurement"]']);
    expect(revisedSince('sitemap_profile_revisions', 'user_id')).toEqual([]);

    for (const write of [
      "UPDATE templates SET updated_at = '2026-02-02' WHERE id = 'launch'",
      "UPDATE templates SET is_public = 0 WHERE id = 'launch'",
      "UPDATE templates SET is_public = 1 WHERE id = 'launch'",
      "DELETE FROM templates WHERE id = 'launch'",
    ]) {
      expect(bumpedBy(write), write).toEqual(TEMPLATE_FAMILIES);
      expect(revisedSince('sitemap_profile_revisions', 'user_id'), write).toEqual([]);
    }
  });

  it('refresh nothing for a private one, or a row whose owner fields disagree', () => {
    resetRevisions();
    storeProfileTemplate(d1, { id: 'private-plan', ownerType: 'team', isPublic: false });
    storeProfileTemplate(d1, { id: 'user-row-with-team', ownerType: 'user', teamId: ACME.id });
    d1.run(`INSERT INTO templates (id, user_id, title, items, is_public, created_at, owner_type, team_id, slug)
      VALUES ('team-row-without-team', ?, 'Orphan', '[]', 1, '2026-02-01', 'team', NULL, 'orphan')`, CREATOR.id);

    expect(revisedSince('sitemap_revisions', 'kind')).toEqual([]);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual([]);
  });

  it("still refresh a Creator's profile when their public Personal Template moves into an Organization", () => {
    storeProfileTemplate(d1, { id: 'bob-plan' });

    expect(bumpedBy("UPDATE templates SET owner_type = 'team', team_id = ? WHERE id = 'bob-plan'", ACME.id)).toEqual(EVERY_FAMILY);
    expect(revisedSince('sitemap_profile_revisions', 'user_id')).toEqual([PERSONAL_OWNER.id]);
  });
});

describe("the sitemap triggers on Organizations, whose profiles the profiles sitemap lists since 0032", () => {
  beforeEach(() => {
    d1 = new SqliteD1();
    seedProfileOwners(d1);
  });

  afterEach(() => {
    d1.close();
  });

  it('refresh the profiles sitemap alone when an Organization without public Templates changes its profile, slug or archive', () => {
    for (const write of [
      "UPDATE teams SET avatar_url = 'https://serplists.com/a.webp', description = 'New', updated_at = '2026-05-01' WHERE id = ?",
      "UPDATE teams SET slug = 'acme-renamed' WHERE id = ?",
      "UPDATE teams SET archived_at = '2026-05-02' WHERE id = ?",
    ]) {
      expect(bumpedBy(write, ACME.id), write).toEqual(['profiles']);
    }
  });

  it("refresh every family, and its Templates' categories, when an Organization with public Templates changes its slug or is archived", () => {
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team', category: '["Procurement"]' });

    expect(bumpedBy("UPDATE teams SET slug = 'acme-renamed' WHERE id = ?", ACME.id)).toEqual(EVERY_FAMILY);
    expect(revisedSince('sitemap_category_revisions', 'category')).toEqual(['["Procurement"]']);
    expect(bumpedBy("UPDATE teams SET archived_at = '2026-05-02' WHERE id = ?", ACME.id)).toEqual(EVERY_FAMILY);
    expect(bumpedBy("UPDATE teams SET updated_at = '2026-05-03' WHERE id = ?", ACME.id)).toEqual([]);
  });

  it('refresh nothing for a change no sitemap shows, or for an Organization the sitemaps leave out', () => {
    expect(bumpedBy("UPDATE teams SET name = 'Acme Renamed' WHERE id = ?", ACME.id)).toEqual([]);
    expect(bumpedBy("UPDATE teams SET updated_at = '2026-05-01' WHERE id = ?", ARCHIVED_ORGANIZATION.id)).toEqual([]);
    expect(bumpedBy("INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES ('no-handle', 'No Handle', NULL, ?, '2026-04-01')", CREATOR.id)).toEqual([]);
    expect(bumpedBy("UPDATE teams SET slug = 'not a handle' WHERE id = 'no-handle'")).toEqual([]);
  });

  it('refresh the profiles sitemap when a listed Organization is created, gains a valid handle or is deleted', () => {
    expect(bumpedBy("INSERT INTO teams (id, name, slug, created_by_user_id, created_at) VALUES ('new-org', 'New', 'new-org', ?, '2026-04-01')", CREATOR.id)).toEqual(['profiles']);
    addOrganization('unnamed', null);
    expect(bumpedBy("UPDATE teams SET slug = 'named-org' WHERE id = 'unnamed'")).toEqual(['profiles']);
    expect(bumpedBy("DELETE FROM teams WHERE id = 'new-org'")).toEqual(['profiles']);
  });
});

describe('migration 0032 on a database that already holds public Organization Templates', () => {
  afterEach(() => {
    d1.close();
  });

  it('dates the categories only they use, keeps the later date of a category both use, and misses every cached sitemap', () => {
    const before0032 = readdirSync(new URL('../../../db/migrations/', import.meta.url))
      .filter((name) => name.endsWith('.sql') && name < MIGRATION_0032)
      .sort()
      .map(readMigration);
    d1 = new SqliteD1({ schemaSql: before0032 });
    seedProfileOwners(d1);
    const categories: Array<[string, string, string | null]> = [
      ['procurement', '["Procurement"]', null],
      ['operations', '["Operations"]', '2026-05-01 00:00:00'],
      ['travel', '["Travel"]', '2026-01-01 00:00:00'],
    ];
    for (const [id, category, personalDate] of categories) {
      storeProfileTemplate(d1, { id, ownerType: 'team', category, createdAt: '2026-03-01T00:00:00.000Z' });
      if (personalDate) d1.run('INSERT INTO sitemap_category_revisions (category, revised_at) VALUES (?, ?)', category, personalDate);
    }
    d1.run('UPDATE sitemap_revisions SET revised_at = ?', LONG_AGO);

    d1.sqlite.exec(readMigration(MIGRATION_0032));

    expect(d1.rows('SELECT category, revised_at FROM sitemap_category_revisions ORDER BY category')).toEqual([
      { category: '["Operations"]', revised_at: '2026-05-01 00:00:00' },
      { category: '["Procurement"]', revised_at: '2026-03-01T00:00:00.000Z' },
      { category: '["Travel"]', revised_at: '2026-03-01T00:00:00.000Z' },
    ]);
    expect(revisedSince('sitemap_revisions', 'kind')).toEqual(EVERY_FAMILY);
  });
});
