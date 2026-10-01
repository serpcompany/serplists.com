import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMocks } from "../../../support/mockedDrizzleD1";
import { chainSelectsUpdatesAndDeletes } from "../../../support/drizzleChainMocks";

import {
  authenticatePersonalRunKey,
  createPersonalRunKeySecret,
  markPersonalRunKeyUsed,
} from "@functions/api/utils/personal-run-key";
import { apiEnv } from "../../../support/apiEnv";

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
    const headers = authorization ? { Authorization: authorization } : undefined;
    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", { headers }),
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

  it("records successful tool use at most once per fifteen minutes", async () => {
    await markPersonalRunKeyUsed(mockEnv, {
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      permissions: ["runs:read"],
      lastUsedAt: null,
    });

    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ last_used_at: expect.any(String) });
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
});
