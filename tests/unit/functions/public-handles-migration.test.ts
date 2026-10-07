import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigration, SqliteD1 } from '../../support/sqlite-d1';

const NOW = '2026-10-05T00:00:00.000Z';
const HANDLE_TAKEN = /UNIQUE constraint failed: public_handles\.handle/;
const ACME_ALICE_AND_OWNER = [
  { handle: 'acme', owner_type: 'team', owner_id: 'org-acme' },
  { handle: 'alice', owner_type: 'user', owner_id: 'alice' },
  { handle: 'owner', owner_type: 'user', owner_id: 'owner' },
];

let db: SqliteD1;

const addUser = (id: string, username: string | null) =>
  db.run('INSERT INTO users (id, email, name, username, created_at) VALUES (?, ?, ?, ?, ?)', id, `${id}@example.test`, id, username, NOW);
const addOrganization = (id: string, slug: string | null) =>
  db.run(
    "INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES (?, ?, ?, 'owner', 'owner', ?)",
    id, id, slug, NOW,
  );
const handles = () =>
  db.rows<{ handle: string; owner_type: string; owner_id: string }>(
    'SELECT handle, owner_type, owner_id FROM public_handles ORDER BY handle',
  );

describe('the public handle registry, on the migrated tables', () => {
  beforeEach(() => {
    db = new SqliteD1();
    addUser('owner', 'owner');
  });

  afterEach(() => {
    db.sqlite.close();
  });

  it('registers usernames and Organization slugs under their lowercase handle as they are created', () => {
    addUser('alice', 'Alice');
    addOrganization('org-acme', 'acme');
    addUser('no-username', null);
    addOrganization('org-no-slug', null);

    expect(handles()).toEqual(ACME_ALICE_AND_OWNER);
  });

  it("refuses an Organization slug that is a User's handle in any case, and a username that is an Organization's, writing nothing", () => {
    addUser('alice', 'alice');
    addOrganization('org-acme', 'acme');

    expect(() => addOrganization('org-alice', 'ALICE')).toThrow(HANDLE_TAKEN);
    expect(() => addUser('acme-fan', 'Acme')).toThrow(HANDLE_TAKEN);
    expect(() => db.run("UPDATE users SET username = 'acme' WHERE id = 'alice'")).toThrow(HANDLE_TAKEN);
    expect(() => db.run("UPDATE teams SET slug = 'alice' WHERE id = 'org-acme'")).toThrow(HANDLE_TAKEN);

    expect(db.rows("SELECT id FROM teams WHERE id = 'org-alice'")).toEqual([]);
    expect(db.rows("SELECT id FROM users WHERE id = 'acme-fan'")).toEqual([]);
    expect(db.rows("SELECT username FROM users WHERE id = 'alice'")).toEqual([{ username: 'alice' }]);
    expect(db.rows("SELECT slug FROM teams WHERE id = 'org-acme'")).toEqual([{ slug: 'acme' }]);
    expect(handles().map(({ handle }) => handle)).toEqual(['acme', 'alice', 'owner']);
  });

  it('refuses two Users or two Organizations whose handles differ only in case', () => {
    addUser('alice', 'alice');
    addOrganization('org-acme', 'acme');

    expect(() => addUser('alice-2', 'ALICE')).toThrow(HANDLE_TAKEN);
    expect(() => addOrganization('org-acme-2', 'Acme')).toThrow(HANDLE_TAKEN);
  });

  it('moves the handle when its owner renames, freeing the old one, and keeps it when only the case changes', () => {
    addUser('alice', 'alice');
    addOrganization('org-acme', 'acme');

    db.run("UPDATE users SET username = 'alice2' WHERE id = 'alice'");
    db.run("UPDATE teams SET slug = 'ACME' WHERE id = 'org-acme'");
    addOrganization('org-alice', 'alice');
    db.run("UPDATE users SET name = 'Alice Renamed' WHERE id = 'alice'");

    expect(handles()).toEqual([
      { handle: 'acme', owner_type: 'team', owner_id: 'org-acme' },
      { handle: 'alice', owner_type: 'team', owner_id: 'org-alice' },
      { handle: 'alice2', owner_type: 'user', owner_id: 'alice' },
      { handle: 'owner', owner_type: 'user', owner_id: 'owner' },
    ]);
  });

  it('frees a handle when the username is cleared or its owner is deleted, and an archived Organization keeps its own', () => {
    addUser('alice', 'alice');
    addUser('bob', 'bob');
    addOrganization('org-acme', 'acme');

    db.run("UPDATE users SET username = NULL WHERE id = 'alice'");
    db.run("DELETE FROM users WHERE id = 'bob'");
    db.run("UPDATE teams SET archived_at = ? WHERE id = 'org-acme'", NOW);

    expect(handles().map(({ handle }) => handle)).toEqual(['acme', 'owner']);
    expect(() => addUser('acme-fan', 'acme')).toThrow(HANDLE_TAKEN);
  });

  it('rolls back the whole batch when a claim in it is refused', async () => {
    addUser('alice', 'alice');

    await expect(db.batch([
      db.prepare("INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('org-alice', 'Alice Org', 'alice', 'owner', 'owner', ?)").bind(NOW),
      db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m-1', 'org-alice', 'owner', 'owner', 'active', ?)").bind(NOW),
    ])).rejects.toThrow(HANDLE_TAKEN);

    expect(db.rows("SELECT id FROM team_members WHERE id = 'm-1'")).toEqual([]);
  });
});

describe('migration 0028 on a database that already has usernames and Organization slugs', () => {
  const migrationsBefore0028 = readdirSync(new URL('../../../db/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql') && name < '0028')
    .sort()
    .map(readMigration);

  beforeEach(() => {
    db = new SqliteD1({ schemaSql: migrationsBefore0028 });
    addUser('owner', 'owner');
  });

  afterEach(() => {
    db.sqlite.close();
  });

  it('backfills every existing handle, lowercased, without changing a username or slug', () => {
    addUser('alice', 'Alice');
    addUser('no-username', null);
    addOrganization('org-acme', 'acme');

    db.sqlite.exec(readMigration('0028_add_public_handles.sql'));

    expect(handles()).toEqual(ACME_ALICE_AND_OWNER);
    expect(db.rows("SELECT username FROM users WHERE id = 'alice'")).toEqual([{ username: 'Alice' }]);
  });

  it('stops on a User and an Organization that already share a handle, so a collision is renamed by hand first', () => {
    addUser('alice', 'alice');
    addOrganization('org-alice', 'Alice');

    expect(() => db.sqlite.exec(readMigration('0028_add_public_handles.sql'))).toThrow(HANDLE_TAKEN);
  });
});
