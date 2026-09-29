import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  return {
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    },
    selectChain,
    insertChain,
    updateChain,
  };
});

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
const keyMocks = vi.hoisted(() => ({
  createPersonalRunKeySecret: vi.fn(),
  insertPersonalRunKeyWithinCap: vi.fn(),
  MAX_ACTIVE_PERSONAL_RUN_KEYS: 10,
}));

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock("@functions/api/utils/session", () => sessionMocks);
vi.mock("@functions/api/utils/personal-run-key", () => keyMocks);

import { handleAgentKeys } from "@functions/api/handlers/agent-keys";

const mockEnv = { DB: {} as D1Database };

describe("Personal run key management handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    keyMocks.createPersonalRunKeySecret.mockResolvedValue({
      key: "slrk_raw-secret-only-returned-once",
      keyHash: "hash-only-stored",
      keyPrefix: "slrk_raw-secr",
    });
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    keyMocks.insertPersonalRunKeyWithinCap.mockResolvedValue(true);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockResolvedValue(undefined);
  });

  it("requires an authenticated browser session", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys"),
      mockEnv,
    );

    expect(response.status).toBe(401);
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });

  it("creates a fixed personal-run credential and returns its secret once", async () => {
    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  Codex release runner  " }),
      }),
      mockEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(body).toEqual({
      key: {
        id: expect.any(String),
        name: "Codex release runner",
        prefix: "slrk_raw-secr",
        createdAt: expect.any(String),
        lastUsedAt: null,
        revokedAt: null,
        status: "active",
      },
      secret: "slrk_raw-secret-only-returned-once",
    });
    expect(keyMocks.insertPersonalRunKeyWithinCap).toHaveBeenCalledWith(mockEnv, expect.objectContaining({
      user_id: "user-1",
      name: "Codex release runner",
      key_prefix: "slrk_raw-secr",
      key_hash: "hash-only-stored",
    }));
    expect(JSON.stringify(body)).not.toContain("hash-only-stored");
  });

  it("refuses a new key and returns no secret once the user has the maximum active keys", async () => {
    keyMocks.insertPersonalRunKeyWithinCap.mockResolvedValueOnce(false);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "One too many" }),
      }),
      mockEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("10 active Run Keys");
    expect(JSON.stringify(body)).not.toContain("slrk_raw-secret-only-returned-once");
  });

  it("rejects blank and oversized names without minting a secret", async () => {
    for (const name of ["   ", "x".repeat(81)]) {
      const response = await handleAgentKeys(
        new Request("http://localhost/api/agent-keys", {
          method: "POST",
          body: JSON.stringify({ name }),
        }),
        mockEnv,
      );
      expect(response.status).toBe(400);
    }

    expect(keyMocks.createPersonalRunKeySecret).not.toHaveBeenCalled();
    expect(keyMocks.insertPersonalRunKeyWithinCap).not.toHaveBeenCalled();
  });

  it("lists safe records and derives active or revoked status", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: "key-active",
        name: "Codex",
        prefix: "slrk_active12",
        createdAt: "2026-09-19T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
      {
        id: "key-revoked",
        name: "Claude",
        prefix: "slrk_revoked1",
        createdAt: "2026-09-18T00:00:00.000Z",
        lastUsedAt: "2026-09-18T01:00:00.000Z",
        revokedAt: "2026-09-18T02:00:00.000Z",
      },
    ]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys"),
      mockEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((key: { status: string }) => key.status)).toEqual(["active", "revoked"]);
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(dbMocks.selectChain.limit).toHaveBeenCalledWith(50);
  });

  it("revokes only a key found under the current user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "key-1" }]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/key-1", { method: "DELETE" }),
      mockEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "key-1", revokedAt: expect.any(String) });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
    expect(dbMocks.updateChain.where).toHaveBeenCalledOnce();
  });

  it("does not revoke a missing, already-revoked, or foreign key", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/not-owned", { method: "DELETE" }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });

  it("rejects lookalike paths instead of treating them as the collection", async () => {
    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys-anything"),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });

  it("rejects segments after a key id instead of revoking the key", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "key-1" }]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/key-1/anything", { method: "DELETE" }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.db.select).not.toHaveBeenCalled();
    expect(dbMocks.db.update).not.toHaveBeenCalled();
  });
});
