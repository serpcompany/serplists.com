import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
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
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.returning.mockResolvedValue([]);
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
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      name: "Codex release runner",
      key_prefix: "slrk_raw-secr",
      key_hash: "hash-only-stored",
    }));
    expect(JSON.stringify(body)).not.toContain("hash-only-stored");
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
    expect(dbMocks.db.insert).not.toHaveBeenCalled();
  });

  it("lists safe records and derives active or revoked status", async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
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
  });

  describe("MCP connection", () => {
    // The staging (preview) allowlist from wrangler.toml.
    const previewEnv = {
      ...mockEnv,
      CORS_ALLOWED_ORIGINS: "https://staging.serplists.com,https://staging.serp-checklists.pages.dev",
    };

    const connection = async (url: string, env: typeof mockEnv & Record<string, string> = previewEnv) => {
      const response = await handleAgentKeys(new Request(url), env);
      return { status: response.status, body: await response.json() };
    };

    it("points a per-deployment URL at the canonical host the MCP server accepts", async () => {
      await expect(connection("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection"))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: "https://staging.serplists.com/api/mcp", hostMismatch: true },
        });
      expect(dbMocks.db.select).not.toHaveBeenCalled();
    });

    it("prefers FRONTEND_URL as the canonical host", async () => {
      await expect(connection("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection", {
        ...previewEnv,
        FRONTEND_URL: "https://staging.serp-checklists.pages.dev/",
      })).resolves.toEqual({
        status: 200,
        body: { mcpEndpoint: "https://staging.serp-checklists.pages.dev/api/mcp", hostMismatch: true },
      });
    });

    it("keeps an allowed or loopback host's own endpoint", async () => {
      await expect(connection("https://staging.serp-checklists.pages.dev/api/agent-keys/connection"))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: "https://staging.serp-checklists.pages.dev/api/mcp", hostMismatch: false },
        });
      await expect(connection("http://localhost:8788/api/agent-keys/connection", mockEnv as never))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: "http://localhost:8788/api/mcp", hostMismatch: false },
        });
    });

    it("returns no endpoint when a remote host has no configured origin", async () => {
      await expect(connection("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection", mockEnv as never))
        .resolves.toEqual({ status: 200, body: { mcpEndpoint: null, hostMismatch: true } });
    });

    it("requires an authenticated browser session", async () => {
      sessionMocks.getSessionUserId.mockResolvedValue(null);

      const response = await handleAgentKeys(
        new Request("https://staging.serplists.com/api/agent-keys/connection"),
        previewEnv,
      );

      expect(response.status).toBe(401);
    });
  });

  it("revokes only a key found under the current user", async () => {
    dbMocks.updateChain.returning.mockResolvedValueOnce([{ revokedAt: "2026-09-19T02:00:00.000Z" }]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/key-1", { method: "DELETE" }),
      mockEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "key-1", revokedAt: "2026-09-19T02:00:00.000Z" });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
    expect(dbMocks.updateChain.where).toHaveBeenCalledOnce();
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });

  it("reports an already-revoked key's stored time without revoking it again", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ revokedAt: "2026-09-18T02:00:00.000Z" }]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/key-1", { method: "DELETE" }),
      mockEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "key-1", revokedAt: "2026-09-18T02:00:00.000Z" });
  });

  it("does not revoke a missing or foreign key", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys/not-owned", { method: "DELETE" }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(expect.objectContaining({ error: "Personal run key not found" }));
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
