import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMocks } from "../../../support/mockedDrizzleD1";
import { chainSelectsUpdatesAndDeletes } from "../../../support/drizzleChainMocks";

import {
  authenticatePersonalRunKey,
  createPersonalRunKeySecret,
  insertPersonalRunKeyWithinCap,
  markPersonalRunKeyUsed,
} from "@functions/api/utils/personal-run-key";
import { apiEnv } from "../../../support/apiEnv";
import { anyInstanceOf } from "../../../support/asymmetricMatchers";

const mockEnv = apiEnv();

describe("personal run key utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.updateChain.returning.mockResolvedValue([]);
  });

  it("generates a prefixed high-entropy secret and only exposes a short display prefix", async () => {
    const first = await createPersonalRunKeySecret();
    const second = await createPersonalRunKeySecret();

    expect(first.key).toMatch(/^slrk_[A-Za-z0-9_-]{43}$/);
    expect(first.keyPrefix).toBe(first.key.slice(0, 13));
    expect(first.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.keyHash).not.toBe(first.key);
    expect(second.key).not.toBe(first.key);
  });

  it("authenticates an active key using a read without recording discovery as use", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "key-1", userId: "user-1", name: "Codex", permissions: '["runs:write","bogus"]', lastUsedAt: null },
    ]);

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer slrk_valid-token" },
      }),
      mockEnv,
    );

    expect(identity).toEqual({
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      permissions: ["templates:read", "runs:read", "runs:write"],
      lastUsedAt: null,
    });
    expect(dbMocks.db.select).toHaveBeenCalledOnce();
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "Basic abc",
    "Bearer ordinary-token",
    "Bearer slrk_has spaces",
  ])("rejects malformed authorization without querying D1: %s", async (authorization) => {
    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", authorization ? { headers: { Authorization: authorization } } : {}),
      mockEnv,
    );

    expect(identity).toBeNull();
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });

  it("rejects an unknown or revoked key without returning an identity", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer slrk_not-found" },
      }),
      mockEnv,
    );

    expect(identity).toBeNull();
    expect(dbMocks.db.select).toHaveBeenCalledOnce();
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });

  it("refuses to make a key it can't hash, so no key is handed out that could never be checked", async () => {
    vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(new Error("SHA-256 is unavailable"));

    await expect(createPersonalRunKeySecret()).rejects.toThrow("Unable to hash personal run key");
  });

  it("authenticates no one when the presented key can't be hashed, without querying D1", async () => {
    vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(new Error("SHA-256 is unavailable"));

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", { headers: { Authorization: "Bearer slrk_valid-token" } }),
      mockEnv,
    );

    expect(identity).toBeNull();
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });

  it("records successful tool use at most once per fifteen minutes", async () => {
    await markPersonalRunKeyUsed(mockEnv, {
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      permissions: ["runs:read"],
      lastUsedAt: null,
    });

    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ last_used_at: anyInstanceOf(String) });
    expect(dbMocks.updateChain.where).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await markPersonalRunKeyUsed(mockEnv, {
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      permissions: ["runs:read"],
      lastUsedAt: new Date().toISOString(),
    });
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });

  it.each([
    ["one row inserted", { meta: { changes: 1 } }, true],
    ["no row inserted, at the cap", { meta: { changes: 0 } }, false],
    ["a result without meta", {}, false],
    ["no result at all", null, false],
  ])("counts a new key as made only when the insert reports one row: %s", async (_label, result, made) => {
    Object.assign(dbMocks.db, { run: vi.fn().mockResolvedValue(result) });

    expect(await insertPersonalRunKeyWithinCap(mockEnv, {
      id: "key-1",
      user_id: "user-1",
      name: "Codex",
      key_prefix: "slrk_abcdefgh",
      key_hash: "hash",
      created_at: "2026-10-01T00:00:00.000Z",
      permissions: ["runs:read"],
    })).toBe(made);
  });
});
