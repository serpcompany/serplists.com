import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration = (name: string) => readFileSync(
  new URL(`../../../db/migrations/${name}`, import.meta.url),
  'utf8',
);

describe('sitemap revision migrations', () => {
  it('backfills real content dates and records public visibility removal', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT, name TEXT, avatar_url TEXT, email TEXT,
        email_verified INTEGER, created_at TEXT NOT NULL, updated_at TEXT, auth_updated_at INTEGER
      );
      CREATE TABLE templates (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL,
        team_id TEXT, is_public INTEGER, deleted_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT, category TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO users VALUES ('u1', 'alice', 'Alice', NULL, 'alice@example.com', 0, '2026-09-03 10:00:00', '2026-09-03T00:00:00Z', 1788498000000);
      INSERT INTO templates VALUES (
        't1', 'u1', 'user', NULL, 1, NULL, '2026-09-03 23:59:59', NULL, 'SEO'
      );
      INSERT INTO templates VALUES (
        't2', 'u1', 'user', NULL, 1, NULL, '2026-09-03T00:00:00Z', NULL, 'SEO'
      );
    `);

    db.exec(migration('0023_add_sitemap_revision_state.sql'));

    const seeded = db.prepare(
      `SELECT revised_at FROM sitemap_profile_revisions WHERE user_id = 'u1'`,
    ).get() as { revised_at: string };
    expect(seeded.revised_at).toBe('2026-09-04 05:00:00');
    const templateFamily = db.prepare(
      `SELECT revised_at FROM sitemap_revisions WHERE kind = 'templates'`,
    ).get() as { revised_at: string };
    expect(templateFamily.revised_at).toBe('2026-09-04 05:00:00');

    db.exec(`UPDATE sitemap_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_profile_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_owner_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_category_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE users SET email='new@example.com', email_verified=1, auth_updated_at=1788584400000 WHERE id='u1'`);
    db.exec(`INSERT INTO users VALUES ('u2', NULL, 'Private', NULL, 'private@example.com', 1, '2026-09-04 00:00:00', NULL, 1788584400000)`);
    expect(db.prepare(`SELECT kind, revised_at FROM sitemap_revisions ORDER BY kind`).all()).toEqual([
      { kind: 'categories', revised_at: '2000-01-01 00:00:00.000' },
      { kind: 'profiles', revised_at: '2000-01-01 00:00:00.000' },
      { kind: 'templates', revised_at: '2000-01-01 00:00:00.000' },
    ]);
    expect(db.prepare(`SELECT COUNT(*) count FROM sitemap_profile_revisions WHERE user_id='u2'`).get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT revised_at FROM sitemap_owner_revisions WHERE user_id='u1'`).get()).toEqual({ revised_at: '2000-01-01 00:00:00.000' });

    db.exec(`UPDATE users SET username='alice_new', name='Alice New', avatar_url='https://example.com/a.png' WHERE id='u1'`);
    expect(db.prepare(`SELECT kind FROM sitemap_revisions WHERE revised_at > '2000-01-01 00:00:00.000' ORDER BY kind`).all().map((row) => row.kind)).toEqual([
      'categories', 'profiles', 'templates',
    ]);
    expect((db.prepare(`SELECT revised_at FROM sitemap_owner_revisions WHERE user_id='u1'`).get() as { revised_at: string }).revised_at).not.toBe('2000-01-01 00:00:00.000');

    db.exec(`UPDATE sitemap_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_owner_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE users SET avatar_url='https://example.com/profile-only.png' WHERE id='u1'`);
    expect(db.prepare(`SELECT kind FROM sitemap_revisions WHERE revised_at > '2000-01-01 00:00:00.000' ORDER BY kind`).all().map((row) => row.kind)).toEqual(['profiles']);
    expect(db.prepare(`SELECT revised_at FROM sitemap_owner_revisions WHERE user_id='u1'`).get()).toEqual({ revised_at: '2000-01-01 00:00:00.000' });

    db.exec(`UPDATE sitemap_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_profile_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE sitemap_owner_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
    db.exec(`UPDATE templates SET is_public = 0 WHERE id = 't1'`);

    const revisedKinds = db.prepare(
      `SELECT kind FROM sitemap_revisions WHERE revised_at > '2000-01-01 00:00:00.000' ORDER BY kind`,
    ).all().map((row) => row.kind);
    const profileRevision = db.prepare(
      `SELECT revised_at FROM sitemap_profile_revisions WHERE user_id = 'u1'`,
    ).get() as { revised_at: string };

    expect(revisedKinds).toEqual(['categories', 'profiles', 'templates']);
    expect(profileRevision.revised_at).not.toBe('2000-01-01 00:00:00.000');
    expect(db.prepare(`SELECT revised_at FROM sitemap_owner_revisions WHERE user_id='u1'`).get()).toEqual({ revised_at: '2000-01-01 00:00:00.000' });

    db.exec(`DELETE FROM users WHERE id='u1'`);
    expect(db.prepare(`SELECT COUNT(*) count FROM templates WHERE user_id='u1'`).get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT COUNT(*) count FROM sitemap_profile_revisions WHERE user_id='u1'`).get()).toEqual({ count: 0 });
    expect(db.prepare(`SELECT COUNT(*) count FROM sitemap_owner_revisions WHERE user_id='u1'`).get()).toEqual({ count: 0 });

    db.close();
  });

  // functions/sitemap/cache.ts keys each shard by its own kind only, so these pin which
  // kinds each write bumps. A write that changes a shard's output must bump its kind.
  it('bumps only the revision kinds whose sitemaps a write changes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT, name TEXT, avatar_url TEXT, email TEXT,
        email_verified INTEGER, created_at TEXT NOT NULL, updated_at TEXT, auth_updated_at INTEGER
      );
      CREATE TABLE templates (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, owner_type TEXT NOT NULL,
        team_id TEXT, is_public INTEGER, deleted_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT, category TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO users VALUES ('plain', 'plain_user', 'Plain', NULL, 'plain@example.com', 1, '2026-09-01 00:00:00', NULL, NULL);
      INSERT INTO users VALUES ('owner', 'owner_user', 'Owner', NULL, 'owner@example.com', 1, '2026-09-01 00:00:00', NULL, NULL);
      INSERT INTO users VALUES ('author', 'author_user', 'Author', NULL, 'author@example.com', 1, '2026-09-01 00:00:00', NULL, NULL);
      INSERT INTO templates VALUES ('uncategorized', 'owner', 'user', NULL, 1, NULL, '2026-09-01 00:00:00', NULL, NULL);
      INSERT INTO templates VALUES ('categorized', 'author', 'user', NULL, 1, NULL, '2026-09-01 00:00:00', NULL, 'SEO');
    `);
    db.exec(migration('0023_add_sitemap_revision_state.sql'));

    const bumped = (write: string) => {
      db.exec(`UPDATE sitemap_revisions SET revised_at = '2000-01-01 00:00:00.000'`);
      db.exec(write);
      return db.prepare(
        `SELECT kind FROM sitemap_revisions WHERE revised_at > '2000-01-01 00:00:00.000' ORDER BY kind`,
      ).all().map((row) => row.kind);
    };

    // Profile-only writes leave the templates and categories shards byte-identical.
    expect(bumped(`INSERT INTO users VALUES ('new', 'new_user', NULL, NULL, 'new@example.com', 0, '2026-09-02 00:00:00', NULL, NULL)`)).toEqual(['profiles']);
    expect(bumped(`UPDATE users SET avatar_url = 'https://example.com/a.png' WHERE id = 'author'`)).toEqual(['profiles']);
    expect(bumped(`UPDATE users SET username = 'plain_renamed' WHERE id = 'plain'`)).toEqual(['profiles']);
    expect(bumped(`UPDATE users SET name = 'Plain Renamed' WHERE id = 'plain'`)).toEqual(['profiles']);
    expect(bumped(`UPDATE users SET email = 'other@example.com', email_verified = 0 WHERE id = 'author'`)).toEqual([]);
    expect(bumped(`INSERT INTO templates VALUES ('private', 'plain', 'user', NULL, 0, NULL, '2026-09-02 00:00:00', NULL, 'SEO')`)).toEqual([]);

    // An owner's username feeds the templates shard; categories follow categorized Templates.
    expect(bumped(`UPDATE users SET username = 'owner_renamed' WHERE id = 'owner'`)).toEqual(['profiles', 'templates']);
    expect(bumped(`UPDATE users SET name = 'Author Renamed' WHERE id = 'author'`)).toEqual(['categories', 'profiles', 'templates']);

    // Public Template writes change every family.
    const all = ['categories', 'profiles', 'templates'];
    expect(bumped(`INSERT INTO templates VALUES ('published', 'plain', 'user', NULL, 1, NULL, '2026-09-02 00:00:00', NULL, NULL)`)).toEqual(all);
    expect(bumped(`UPDATE templates SET updated_at = '2026-09-03 00:00:00' WHERE id = 'published'`)).toEqual(all);
    expect(bumped(`UPDATE templates SET is_public = 1 WHERE id = 'private'`)).toEqual(all);
    expect(bumped(`DELETE FROM templates WHERE id = 'published'`)).toEqual(all);
    expect(bumped(`DELETE FROM users WHERE id = 'author'`)).toEqual(all);

    db.close();
  });
});
