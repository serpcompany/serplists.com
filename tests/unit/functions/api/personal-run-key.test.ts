import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  return {
    db: {
      select: vi.fn(() => selectChain),
      update: vi.fn(() => updateChain),
    },
    selectChain,
    updateChain,
  };
});

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));

import {
  authenticatePersonalRunKey,
  createPersonalRunKeySecret,
  markPersonalRunKeyUsed,
} from "@functions/api/utils/personal-run-key";

const mockEnv = { DB: {} as D1Database };

describe("personal run key utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
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

  it("authenticates an active key using a read without recording discovery as use", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "key-1", userId: "user-1", name: "Codex", lastUsedAt: null },
    ]);

    const identity = await authenticatePersonalRunKey(
      new Request("http://localhost/api/mcp", {
        headers: { Authorization: "Bearer slrk_valid-token" },
      }),
      mockEnv,
    );

    expect(identity).toEqual({ keyId: "key-1", userId: "user-1", name: "Codex", lastUsedAt: null });
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
      lastUsedAt: null,
    });

    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ last_used_at: expect.any(String) });
    expect(dbMocks.updateChain.where).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await markPersonalRunKeyUsed(mockEnv, {
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      lastUsedAt: new Date().toISOString(),
    });
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });
});
