import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../../db/migrations/0025_add_personal_run_keys.sql", import.meta.url),
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

    db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
    expect(db.prepare("SELECT count(*) AS count FROM personal_run_keys").get()).toEqual({ count: 0 });
    db.close();
  });
});
