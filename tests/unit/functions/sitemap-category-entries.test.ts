import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { loadCategoryEntries } from '../../../functions/sitemap/shared';
import type { Env } from '../../../functions/api/types';

type SqlValue = string | number | null;

// A D1 binding backed by in-memory SQLite, so the real Drizzle query runs against real rows.
// Drizzle maps selected fields from `.raw()` rows, in select order.
function sqliteD1(db: DatabaseSync) {
  return {
    prepare: (sql: string) => {
      let params: SqlValue[] = [];
      const statement = {
        bind: (...values: SqlValue[]) => {
          params = values;
          return statement;
        },
        raw: async () => db.prepare(sql).all(...params).map((row) => Object.values(row)),
        all: async () => ({ results: db.prepare(sql).all(...params) }),
      };
      return statement;
    },
  };
}

function categoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
    CREATE TABLE templates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL, team_id TEXT,
      is_public INTEGER, deleted_at TEXT, category TEXT, created_at TEXT NOT NULL, updated_at TEXT
    );
    CREATE TABLE sitemap_owner_revisions (user_id TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
    CREATE TABLE sitemap_category_revisions (category TEXT PRIMARY KEY, revised_at TEXT NOT NULL);
  `);
  return db;
}

function addPublicTemplate(db: DatabaseSync, id: string, username: string | null, category: string) {
  db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(`user-${id}`, username);
  db.prepare(`
    INSERT INTO templates (id, user_id, owner_type, team_id, is_public, deleted_at, category, created_at, updated_at)
    VALUES (?, ?, 'user', NULL, 1, NULL, ?, '2030-01-01 00:00:00', NULL)
  `).run(id, `user-${id}`, JSON.stringify([category]));
}

async function categoryPaths(db: DatabaseSync): Promise<string[]> {
  const entries = await loadCategoryEntries({ DB: sqliteD1(db) } as unknown as Env);
  return entries.map((entry) => entry.path);
}

describe('category sitemap entries', () => {
  it('lists a category that a public template with a public owner URL uses', async () => {
    const db = categoryDatabase();
    addPublicTemplate(db, 't-listed', 'alice', 'Zymurgy Listed');

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-listed');
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

    expect(await categoryPaths(db)).toContain('/categories/zymurgy-shared');
  });
});
