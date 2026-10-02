import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteD1 } from "../../support/sqlite-d1";

describe("the SQLite stand-in for D1 that unit tests run handlers on", () => {
  let database: SqliteD1;

  const insertUser = (id: string) =>
    database.binding.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").bind(id, `${id}@example.test`, id);
  const userIds = () => database.rows<{ id: string }>("SELECT id FROM users ORDER BY id").map(({ id }) => id);

  beforeEach(() => {
    database = new SqliteD1();
  });

  afterEach(() => {
    database.close();
  });

  it("applies a batch as one transaction, as D1 does, so a failing statement undoes the ones before it", async () => {
    await expect(database.binding.batch([insertUser("user-1"), insertUser("user-2"), insertUser("user-1")])).rejects.toThrow(
      /UNIQUE constraint failed/,
    );

    expect(userIds()).toEqual([]);
  });

  it("commits a batch whose statements all succeed and reports each statement's changes", async () => {
    const results = await database.binding.batch([insertUser("user-1"), insertUser("user-2")]);

    expect(results.map(({ meta }) => meta.changes)).toEqual([1, 1]);
    expect(userIds()).toEqual(["user-1", "user-2"]);
  });

  it("enforces foreign keys, as D1 does", async () => {
    const orphanKey = database.binding
      .prepare("INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?, ?)")
      .bind("key-1", "no-such-user", "Key", "slrk_key", "hash");

    await expect(orphanKey.run()).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("builds only the tables a test asks for when given its own schema", () => {
    const billingOnly = new SqliteD1({ schemaSql: ["CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL)"] });

    expect(billingOnly.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([{ name: "users" }]);
    billingOnly.close();
  });

  it("fails a statement the way a D1 outage would when the statement hook throws, and runs it again once the hook is removed", async () => {
    database.setStatementHook(() => {
      throw new Error("D1_ERROR: Network connection lost");
    });
    await expect(insertUser("user-1").run()).rejects.toThrow("D1_ERROR: Network connection lost");

    database.setStatementHook(null);
    await insertUser("user-1").run();
    expect(userIds()).toEqual(["user-1"]);
  });
});
