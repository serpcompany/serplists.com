import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteD1 } from '../../support/sqlite-d1';

const LONG_AGO = '2000-01-01 00:00:00.000';

let db: SqliteD1;

const profilesRevisedAt = () =>
  db.rows<{ revised_at: string }>("SELECT revised_at FROM sitemap_revisions WHERE kind = 'profiles'").map(({ revised_at }) => revised_at);
const addUser = (id: string, username: string) =>
  db.run("INSERT INTO users (id, email, name, username, created_at) VALUES (?, ?, ?, ?, '2026-10-05T00:00:00.000Z')", id, `${id}@example.test`, id, username);

describe('the sitemap triggers after 0029, for usernames with a hyphen', () => {
  beforeEach(() => {
    db = new SqliteD1();
    db.run('UPDATE sitemap_revisions SET revised_at = ?', LONG_AGO);
  });

  afterEach(() => {
    db.sqlite.close();
  });

  it('refresh the profile sitemaps when a User with a hyphenated username joins', () => {
    addUser('jane', 'jane-doe');

    expect(profilesRevisedAt()).not.toEqual([LONG_AGO]);
    expect(db.rows("SELECT user_id FROM sitemap_profile_revisions WHERE user_id = 'jane'")).toHaveLength(1);
  });

  it('refresh them when a username gains or loses a hyphen, and when its User is deleted', () => {
    addUser('jane', 'janedoe');

    for (const change of ["UPDATE users SET username = 'jane-doe' WHERE id = 'jane'", "DELETE FROM users WHERE id = 'jane'"]) {
      db.run('UPDATE sitemap_revisions SET revised_at = ?', LONG_AGO);
      db.run(change);
      expect(profilesRevisedAt()).not.toEqual([LONG_AGO]);
    }
  });

  it('still leave them alone for a username outside the handle rule', () => {
    addUser('spaced', 'jane doe');

    expect(profilesRevisedAt()).toEqual([LONG_AGO]);
  });
});
