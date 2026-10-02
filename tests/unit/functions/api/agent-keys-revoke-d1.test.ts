import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { SqliteD1 } from "../../../support/sqlite-d1";
import type { StoredRow } from "../../../support/d1Doubles";
import { apiEnv } from "../../../support/apiEnv";
import { z } from "zod";
import { readJson } from "../../../support/readJson";

import { handleAgentKeys } from "@functions/api/handlers/agent-keys";
import { anyInstanceOf, objectContaining } from "../../../support/asymmetricMatchers";

const revokeBody = z.object({ revokedAt: z.unknown() }).passthrough();

const ORIGINAL_REVOKED_AT = "2026-09-19T02:00:00.000Z";

describe("DELETE /api/agent-keys/:id on the migrated tables", () => {
  let database: SqliteD1;

  const addUser = (id: string) =>
    database.sqlite
      .prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)")
      .run(id, `${id}@example.com`, `Name ${id}`);

  const addKey = (id: string, userId: string, revokedAt: string | null = null) =>
    database.sqlite
      .prepare(
        "INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, userId, `Key ${id}`, `slrk_${id}`, `hash-${id}`, revokedAt);

  const storedRevokedAt = (id: string) => {
    const row: StoredRow | undefined = database.sqlite.prepare("SELECT revoked_at FROM personal_run_keys WHERE id = ?").get(id);
    return row?.revoked_at;
  };

  const revoke = async (id: string) => {
    const response = await handleAgentKeys(
      new Request(`http://localhost/api/agent-keys/${id}`, { method: "DELETE" }),
      apiEnv({ DB: database.binding }),
    );
    return { status: response.status, body: await readJson(response, revokeBody) };
  };

  beforeEach(() => {
    database = new SqliteD1();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    addUser("user-1");
    addUser("user-2");
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it("revokes an active key and stores the time it returns", async () => {
    addKey("key-1", "user-1");

    const { status, body } = await revoke("key-1");

    expect(status).toBe(200);
    expect(body).toEqual({ id: "key-1", revokedAt: anyInstanceOf(String) });
    expect(storedRevokedAt("key-1")).toBe(body.revokedAt);
  });

  it("answers an already-revoked key with its original revoke time and keeps it", async () => {
    addKey("key-1", "user-1", ORIGINAL_REVOKED_AT);

    await expect(revoke("key-1")).resolves.toEqual({
      status: 200,
      body: { id: "key-1", revokedAt: ORIGINAL_REVOKED_AT },
    });
    expect(storedRevokedAt("key-1")).toBe(ORIGINAL_REVOKED_AT);
  });

  it("answers a retried revoke with the time of the first one", async () => {
    addKey("key-1", "user-1");

    const first = await revoke("key-1");
    const second = await revoke("key-1");

    expect(second).toEqual({ status: 200, body: { id: "key-1", revokedAt: first.body.revokedAt } });
    expect(storedRevokedAt("key-1")).toBe(first.body.revokedAt);
  });

  it("still gives 404 for a missing key or another user's key, active or revoked", async () => {
    addKey("key-2", "user-2");
    addKey("key-3", "user-2", ORIGINAL_REVOKED_AT);

    for (const id of ["missing", "key-2", "key-3"]) {
      await expect(revoke(id)).resolves.toEqual({
        status: 404,
        body: objectContaining({ error: "Personal run key not found" }),
      });
    }
    expect(storedRevokedAt("key-2")).toBeNull();
    expect(storedRevokedAt("key-3")).toBe(ORIGINAL_REVOKED_AT);
  });
});
