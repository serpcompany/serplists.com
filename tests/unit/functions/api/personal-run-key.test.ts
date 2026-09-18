import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  return {
    db: {
      update: vi.fn(() => updateChain),
    },
    updateChain,
  };
});

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));

import {
  authenticatePersonalRunKey,
  createPersonalRunKeySecret,
} from "@functions/api/utils/personal-run-key";

const mockEnv = { DB: {} as D1Database };

describe("personal run key utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
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

  it("authenticates an active key, returns its machine identity, and records use", async () => {
    dbMocks.updateChain.returning.mockResolvedValueOnce([
      { id: "key-1", userId: "user-1", name: "Codex" },
    ]);

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer slrk_valid-token" },
      }),
      mockEnv,
    );

    expect(identity).toEqual({ keyId: "key-1", userId: "user-1", name: "Codex" });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ last_used_at: expect.any(String) });
    expect(dbMocks.updateChain.where).toHaveBeenCalledOnce();
    expect(dbMocks.updateChain.returning).toHaveBeenCalledOnce();
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
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown or revoked key without returning an identity", async () => {
    dbMocks.updateChain.returning.mockResolvedValueOnce([]);

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer slrk_not-found" },
      }),
      mockEnv,
    );

    expect(identity).toBeNull();
    expect(dbMocks.db.update).toHaveBeenCalledOnce();
    expect(dbMocks.updateChain.returning).toHaveBeenCalledOnce();
  });
});
