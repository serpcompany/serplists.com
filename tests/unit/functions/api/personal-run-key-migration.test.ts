import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../../db/migrations/0025_add_personal_run_keys.sql", import.meta.url),
  "utf8",
);
const permissionsMigration = readFileSync(
  new URL("../../../../db/migrations/0027_add_personal_run_key_permissions.sql", import.meta.url),
  "utf8",
);

describe("personal run key migration", () => {
  it("creates hashed-key storage with user ownership and cascade deletion", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);");
    db.exec(migration);
    db.prepare("INSERT INTO users(id) VALUES (?)").run("user-1");
    db.prepare(`
      INSERT INTO personal_run_keys(id, user_id, name, key_prefix, key_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run("key-1", "user-1", "Codex", "slrk_example1", "stored-hash");

    const key = db.prepare(`
      SELECT id, user_id, name, key_prefix, key_hash, created_at, last_used_at, revoked_at
      FROM personal_run_keys
    `).get() as Record<string, unknown>;
    expect(key).toMatchObject({
      id: "key-1",
      user_id: "user-1",
      name: "Codex",
      key_prefix: "slrk_example1",
      key_hash: "stored-hash",
      last_used_at: null,
      revoked_at: null,
    });
    expect(key.created_at).toEqual(expect.any(String));
    expect(() => db.prepare(`
      INSERT INTO personal_run_keys(id, user_id, name, key_prefix, key_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run("key-2", "user-1", "Duplicate", "slrk_example2", "stored-hash")).toThrow();
    expect(() => db.prepare(`
      INSERT INTO personal_run_keys(id, user_id, name, key_prefix, key_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(null, "user-1", "Missing ID", "slrk_example3", "another-hash")).toThrow();

    const idColumn = db.prepare("PRAGMA table_info('personal_run_keys')")
      .all()
      .find((column) => column.name === "id");
    expect(idColumn).toMatchObject({ name: "id", notnull: 1, pk: 1 });

    const foreignKey = db.prepare("PRAGMA foreign_key_list('personal_run_keys')").get();
    expect(foreignKey).toMatchObject({
      table: "users",
      from: "user_id",
      to: "id",
      on_delete: "CASCADE",
    });

    db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
    expect(db.prepare("SELECT count(*) AS count FROM personal_run_keys").get()).toEqual({ count: 0 });
    db.close();
  });

  it("backfills existing keys to read templates and read and write runs", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);");
    db.exec(migration);
    db.prepare("INSERT INTO users(id) VALUES (?)").run("user-1");
    const insert = db.prepare(`
      INSERT INTO personal_run_keys(id, user_id, name, key_prefix, key_hash)
      VALUES (?, 'user-1', 'Codex', ?, ?)
    `);
    insert.run("existing-key", "slrk_existing", "existing-hash");

    db.exec(permissionsMigration);
    insert.run("new-key", "slrk_new", "new-hash");

    expect(db.prepare("SELECT id, permissions FROM personal_run_keys ORDER BY id").all()).toEqual([
      { id: "existing-key", permissions: '["templates:read","runs:read","runs:write"]' },
      { id: "new-key", permissions: '["templates:read","runs:read","runs:write"]' },
    ]);
    expect(db.prepare("PRAGMA table_info('personal_run_keys')").all()
      .find((column) => column.name === "permissions")).toMatchObject({ notnull: 1 });
    db.close();
  });
});
