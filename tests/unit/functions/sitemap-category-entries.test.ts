import { describe, expect, it } from 'vitest';

import { createDb } from '../../../functions/api/db';
import {
  isValidTemplateSlug,
  isValidUsername,
  loadCategoryEntries,
  validOrganizationHandleCondition,
  validTemplateSlugCondition,
  validUsernameCondition,
} from '../../../functions/sitemap/shared';
import { teams, templates, users } from '../../../db/schema/index';
import { SqliteD1 } from '../../support/sqlite-d1';
import { apiEnv } from '../../support/apiEnv';

function categoryDatabase(): SqliteD1 {
  return new SqliteD1({ schemaSql: [`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT, archived_at TEXT);
    CREATE TABLE templates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL, team_id TEXT,
      is_public INTEGER, deleted_at TEXT, category TEXT, created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE sitemap_owner_revisions (user_id TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
    CREATE TABLE sitemap_category_revisions (category TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
  `] });
}

type TemplateOwner = { type: 'user' | 'team'; teamId: string | null; isPublic?: 0 | 1; deletedAt?: string };

function addTemplate(
  db: SqliteD1,
  id: string,
  username: string | null,
  category: string,
  owner: TemplateOwner = { type: 'user', teamId: null },
) {
  db.sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(`user-${id}`, username);
  db.sqlite.prepare(`
    INSERT INTO templates (id, user_id, owner_type, team_id, is_public, deleted_at, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2030-01-01 00:00:00', NULL)
  `).run(id, `user-${id}`, owner.type, owner.teamId, owner.isPublic ?? 1, owner.deletedAt ?? null, JSON.stringify([category]));
}

function addOrganization(db: SqliteD1, id: string, slug: string | null, archivedAt: string | null = null) {
  db.sqlite.prepare('INSERT INTO teams (id, slug, archived_at) VALUES (?, ?, ?)').run(id, slug, archivedAt);
}

async function categoryPaths(db: SqliteD1): Promise<string[]> {
  const entries = await loadCategoryEntries(apiEnv({ DB: db.binding }));
  return entries.map((entry) => entry.path);
}

describe('category sitemap entries', () => {
  it('lists a category that a public template with a public owner URL uses', async () => {
    const db = categoryDatabase();
    addTemplate(db, 't-listed', 'alice', 'Zymurgy Listed');

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-listed/');
  });

  it('skips categories whose only templates have owners with no public username', async () => {
    const db = categoryDatabase();
    addTemplate(db, 't-null', null, 'Zymurgy Null');
    addTemplate(db, 't-blank', '   ', 'Zymurgy Blank');
    addTemplate(db, 't-empty', '', 'Zymurgy Empty');
    addTemplate(db, 't-invalid', 'not a username', 'Zymurgy Invalid');

    const paths = await categoryPaths(db);
    expect(paths.filter((path) => path.startsWith('/categories/zymurgy'))).toEqual([]);
  });

  it('keeps a category when any of its templates has an owner with a public username', async () => {
    const db = categoryDatabase();
    addTemplate(db, 't-blank', ' ', 'Zymurgy Shared');
    addTemplate(db, 't-named', 'bob_1', 'Zymurgy Shared');

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-shared/');
  });

  it("lists a category that only an Organization's public Template uses, as the library lists it under its Organization's handle", async () => {
    const db = categoryDatabase();
    addOrganization(db, 'team-1', 'Acme-Launch');
    addTemplate(db, 't-team', null, 'Zymurgy Procurement', { type: 'team', teamId: 'team-1' });

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-procurement/');
  });

  it("skips categories whose only templates belong to an archived Organization or one without a public handle, whatever their Creator's username", async () => {
    const db = categoryDatabase();
    addOrganization(db, 'team-archived', 'gone-org', '2030-01-01 00:00:00');
    addOrganization(db, 'team-unnamed', null);
    addOrganization(db, 'team-invalid', 'not a handle');
    addTemplate(db, 't-archived', 'alice', 'Zymurgy Archived', { type: 'team', teamId: 'team-archived' });
    addTemplate(db, 't-unnamed', 'bob', 'Zymurgy Unnamed', { type: 'team', teamId: 'team-unnamed' });
    addTemplate(db, 't-invalid', 'carol', 'Zymurgy Invalid', { type: 'team', teamId: 'team-invalid' });

    expect((await categoryPaths(db)).filter((path) => path.startsWith('/categories/zymurgy'))).toEqual([]);
  });
});

describe('public Template rule for the sitemaps', () => {
  it('lists the categories of public Personal and Organization Templates, not of private, deleted or malformed rows', async () => {
    const db = categoryDatabase();
    const rows: Array<[string, TemplateOwner]> = [
      ['personal', { type: 'user', teamId: null }],
      ['organization', { type: 'team', teamId: 'team-1' }],
      ['private-organization', { type: 'team', teamId: 'team-1', isPublic: 0 }],
      ['deleted-organization', { type: 'team', teamId: 'team-1', deletedAt: '2030-01-02 00:00:00' }],
      ['user-row-with-team', { type: 'user', teamId: 'team-1' }],
      ['team-row-without-team', { type: 'team', teamId: null }],
      ['team-row-with-blank-team', { type: 'team', teamId: '' }],
    ];
    addOrganization(db, 'team-1', 'acme');
    for (const [id, owner] of rows) addTemplate(db, id, 'alice', `Zymurgy ${id}`, owner);

    const paths = await categoryPaths(db);
    expect(paths.filter((path) => path.startsWith('/categories/zymurgy')).sort()).toEqual([
      '/categories/zymurgy-organization/',
      '/categories/zymurgy-personal/',
    ]);
  });
});

describe('public URL rules for the sitemaps', () => {
  const usernames = ['alice', 'al', 'a'.repeat(30), 'a'.repeat(31), 'bob_smith.2', 'jane-doe', '-edge-', 'Mixed-Case', ' padded ', 'with space', 'émile', 'semi;colon', ''];
  const slugs = ['plan', 'plan-2', 'Plan', '-plan', 'plan-', 'pl--an', 'a'.repeat(160), 'a'.repeat(161), ' trimmed ', 'café', 'x', ''];

  it("applies the same handle and slug rules in SQL as in code, so a shard page's LIMIT counts only rows it lists", async () => {
    const db = new SqliteD1({
      schemaSql: [
        'CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); CREATE TABLE teams (id TEXT PRIMARY KEY, slug TEXT); CREATE TABLE templates (id TEXT PRIMARY KEY, slug TEXT);',
      ],
    });
    usernames.forEach((username, index) => db.sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(`user-${index}`, username));
    usernames.forEach((handle, index) => db.sqlite.prepare('INSERT INTO teams (id, slug) VALUES (?, ?)').run(`team-${index}`, handle));
    slugs.forEach((slug, index) => db.sqlite.prepare('INSERT INTO templates (id, slug) VALUES (?, ?)').run(`template-${index}`, slug));
    const queries = createDb(apiEnv({ DB: db.binding }));

    const usernameRows = await queries.select({ username: users.username }).from(users).where(validUsernameCondition);
    const handleRows = await queries.select({ handle: teams.slug }).from(teams).where(validOrganizationHandleCondition);
    const slugRows = await queries.select({ slug: templates.slug }).from(templates).where(validTemplateSlugCondition);

    const listed = usernames.filter((handle) => isValidUsername(handle.trim())).sort();
    expect(usernameRows.map((row) => row.username).sort()).toEqual(listed);
    expect(handleRows.map((row) => row.handle).sort()).toEqual(listed);
    expect(slugRows.map((row) => row.slug).sort()).toEqual(slugs.filter((slug) => isValidTemplateSlug(slug.trim())).sort());
  });
});
