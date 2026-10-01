import { describe, expect, it } from 'vitest';

import { createDb } from '../../../functions/api/db';
import {
  isValidTemplateSlug,
  isValidUsername,
  loadCategoryEntries,
  publicTemplateCondition,
  validTemplateSlugCondition,
  validUsernameCondition,
} from '../../../functions/sitemap/shared';
import type { Env } from '../../../functions/api/types';
import { templates, users } from '../../../db/schema/index';
import { createSqliteD1, type SqliteD1 } from './api/support/sqlite-d1';

function categoryDatabase(): SqliteD1 {
  return createSqliteD1([`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE templates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL, team_id TEXT,
      is_public INTEGER, deleted_at TEXT, category TEXT, created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE sitemap_owner_revisions (user_id TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
    CREATE TABLE sitemap_category_revisions (category TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
  `]);
}

function addPublicTemplate(
  db: SqliteD1,
  id: string,
  username: string | null,
  category: string,
  owner: { type: 'user' | 'team'; teamId: string | null } = { type: 'user', teamId: null },
) {
  db.sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(`user-${id}`, username);
  db.sqlite.prepare(`
    INSERT INTO templates (id, user_id, owner_type, team_id, is_public, deleted_at, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, NULL, ?, '2030-01-01 00:00:00', NULL)
  `).run(id, `user-${id}`, owner.type, owner.teamId, JSON.stringify([category]));
}

async function categoryPaths(db: SqliteD1): Promise<string[]> {
  const entries = await loadCategoryEntries({ DB: db.binding } as unknown as Env);
  return entries.map((entry) => entry.path);
}

describe('category sitemap entries', () => {
  it('lists a category that a public template with a public owner URL uses', async () => {
    const db = categoryDatabase();
    addPublicTemplate(db, 't-listed', 'alice', 'Zymurgy Listed');

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-listed/');
  });

  it('skips categories whose only templates have owners with no public username', async () => {
    const db = categoryDatabase();
    addPublicTemplate(db, 't-null', null, 'Zymurgy Null');
    addPublicTemplate(db, 't-blank', '   ', 'Zymurgy Blank');
    addPublicTemplate(db, 't-empty', '', 'Zymurgy Empty');
    addPublicTemplate(db, 't-invalid', 'not a username', 'Zymurgy Invalid');

    const paths = await categoryPaths(db);
    expect(paths.filter((path) => path.startsWith('/categories/zymurgy'))).toEqual([]);
  });

  it('keeps a category when any of its templates has an owner with a public username', async () => {
    const db = categoryDatabase();
    addPublicTemplate(db, 't-blank', ' ', 'Zymurgy Shared');
    addPublicTemplate(db, 't-named', 'bob_1', 'Zymurgy Shared');

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-shared/');
  });

  it("lists a category that only an Organization's public Template uses, as the library lists it under its Creator's username", async () => {
    const db = categoryDatabase();
    addPublicTemplate(db, 't-team', 'alice', 'Zymurgy Procurement', { type: 'team', teamId: 'team-1' });

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-procurement/');
  });
});

describe('public Template rule for the sitemaps', () => {
  it('matches public Personal and Organization Templates, not private, deleted or malformed rows', async () => {
    const db = categoryDatabase();
    const insert = db.sqlite.prepare(`
      INSERT INTO templates (id, user_id, owner_type, team_id, is_public, deleted_at, category, created_at)
      VALUES (?, 'user-1', ?, ?, ?, ?, '[]', '2030-01-01 00:00:00')
    `);
    insert.run('personal', 'user', null, 1, null);
    insert.run('organization', 'team', 'team-1', 1, null);
    insert.run('private-organization', 'team', 'team-1', 0, null);
    insert.run('deleted-organization', 'team', 'team-1', 1, '2030-01-02 00:00:00');
    insert.run('user-row-with-team', 'user', 'team-1', 1, null);
    insert.run('team-row-without-team', 'team', null, 1, null);
    insert.run('team-row-with-blank-team', 'team', '', 1, null);

    const rows = await createDb({ DB: db.binding } as unknown as Env)
      .select({ id: templates.id })
      .from(templates)
      .where(publicTemplateCondition)
      .orderBy(templates.id);

    expect(rows.map((row) => row.id)).toEqual(['organization', 'personal']);
  });
});

describe('public URL rules for the sitemaps', () => {
  const usernames = ['alice', 'al', 'a'.repeat(30), 'a'.repeat(31), 'bob_smith.2', ' padded ', 'with space', 'émile', 'semi;colon', ''];
  const slugs = ['plan', 'plan-2', 'Plan', '-plan', 'plan-', 'pl--an', 'a'.repeat(160), 'a'.repeat(161), ' trimmed ', 'café', 'x', ''];

  it("applies the same username and slug rules in SQL as in code, so a shard page's LIMIT counts only rows it lists", async () => {
    const db = createSqliteD1(['CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT); CREATE TABLE templates (id TEXT PRIMARY KEY, slug TEXT);']);
    usernames.forEach((username, index) => db.sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(`user-${index}`, username));
    slugs.forEach((slug, index) => db.sqlite.prepare('INSERT INTO templates (id, slug) VALUES (?, ?)').run(`template-${index}`, slug));
    const queries = createDb({ DB: db.binding } as unknown as Env);

    const usernameRows = await queries.select({ username: users.username }).from(users).where(validUsernameCondition);
    const slugRows = await queries.select({ slug: templates.slug }).from(templates).where(validTemplateSlugCondition);

    expect(usernameRows.map((row) => row.username).sort()).toEqual(usernames.filter((username) => isValidUsername(username.trim())).sort());
    expect(slugRows.map((row) => row.slug).sort()).toEqual(slugs.filter((slug) => isValidTemplateSlug(slug.trim())).sort());
  });
});
