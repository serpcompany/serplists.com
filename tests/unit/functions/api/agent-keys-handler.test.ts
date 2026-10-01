import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { z } from "zod";
import { chainSelectsUpdatesAndDeletes } from "../../../support/drizzleChainMocks";
import { dbMocks } from "../../../support/mockedDrizzleD1";

const keyMocks = vi.hoisted(() => ({
  createPersonalRunKeySecret: vi.fn(),
  insertPersonalRunKeyWithinCap: vi.fn(),
  MAX_ACTIVE_PERSONAL_RUN_KEYS: 10,
}));

vi.mock("@functions/api/utils/personal-run-key", () => keyMocks);

import { handleAgentKeys } from "@functions/api/handlers/agent-keys";
import type { Env } from "@functions/api/types";
import { apiEnv } from "../../../support/apiEnv";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { varFromWranglerToml } from "../../../support/wranglerToml";
import { STAGING_ORIGIN } from "@/lib/seo/siteOrigin";

const mockEnv = apiEnv();

const createdKeyBody = z.object({ key: z.object({ permissions: z.array(z.string()) }).passthrough() }).passthrough();
const keyListBody = z.array(z.object({ status: z.string(), permissions: z.array(z.string()) }).passthrough());

describe("Personal run key management handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    keyMocks.createPersonalRunKeySecret.mockResolvedValue({
      key: "slrk_raw-secret-only-returned-once",
      keyHash: "hash-only-stored",
      keyPrefix: "slrk_raw-secr",
    });
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    keyMocks.insertPersonalRunKeyWithinCap.mockResolvedValue(true);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
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

  it("creates a credential with the default permissions and returns its secret once", async () => {
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
        permissions: ["templates:read", "runs:read", "runs:write"],
        status: "active",
      },
      secret: "slrk_raw-secret-only-returned-once",
    });
    expect(keyMocks.insertPersonalRunKeyWithinCap).toHaveBeenCalledWith(mockEnv, expect.objectContaining({
      user_id: "user-1",
      name: "Codex release runner",
      key_prefix: "slrk_raw-secr",
      key_hash: "hash-only-stored",
      permissions: ["templates:read", "runs:read", "runs:write"],
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
    const body = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(body.error).toContain("10 active Run Keys");
    expect(JSON.stringify(body)).not.toContain("slrk_raw-secret-only-returned-once");
  });

  it("stores chosen permissions with the read each write permission implies", async () => {
    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys", {
        method: "POST",
        body: JSON.stringify({ name: "Template writer", permissions: ["templates:write"] }),
      }),
      mockEnv,
    );
    const body = await readJson(response, createdKeyBody);

    expect(response.status).toBe(201);
    expect(body.key.permissions).toEqual(["templates:read", "templates:write"]);
    expect(keyMocks.insertPersonalRunKeyWithinCap).toHaveBeenCalledWith(mockEnv, expect.objectContaining({
      permissions: ["templates:read", "templates:write"],
    }));
  });

  async function expectEachRefusedWithoutMintingASecret(payloads: unknown[]) {
    for (const payload of payloads) {
      const response = await handleAgentKeys(
        new Request("http://localhost/api/agent-keys", { method: "POST", body: JSON.stringify(payload) }),
        mockEnv,
      );
      expect(response.status).toBe(400);
    }

    expect(keyMocks.createPersonalRunKeySecret).not.toHaveBeenCalled();
    expect(keyMocks.insertPersonalRunKeyWithinCap).not.toHaveBeenCalled();
  }

  it("rejects empty, unknown, and extra permission fields without minting a secret", async () => {
    await expectEachRefusedWithoutMintingASecret([
      { name: "None", permissions: [] },
      { name: "Unknown", permissions: ["templates:delete"] },
      { name: "Admin", permissions: ["runs:read"], admin: true },
    ]);
  });

  it("rejects blank and oversized names without minting a secret", async () => {
    await expectEachRefusedWithoutMintingASecret(["   ", "x".repeat(81)].map((name) => ({ name })));
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
        permissions: '["templates:read","templates:write","runs:read","runs:write"]',
      },
      {
        id: "key-revoked",
        name: "Claude",
        prefix: "slrk_revoked1",
        createdAt: "2026-09-18T00:00:00.000Z",
        lastUsedAt: "2026-09-18T01:00:00.000Z",
        revokedAt: "2026-09-18T02:00:00.000Z",
        permissions: "not json",
      },
    ]);

    const response = await handleAgentKeys(
      new Request("http://localhost/api/agent-keys"),
      mockEnv,
    );
    const body = await readJson(response, keyListBody);

    expect(response.status).toBe(200);
    expect(body.map((key: { status: string }) => key.status)).toEqual(["active", "revoked"]);
    expect(body.map((key: { permissions: string[] }) => key.permissions)).toEqual([
      ["templates:read", "templates:write", "runs:read", "runs:write"],
      [],
    ]);
    expect(JSON.stringify(body)).not.toContain("key_hash");
    expect(dbMocks.selectChain.limit).toHaveBeenCalledWith(50);
  });

  describe("MCP connection", () => {
    const previewEnv = apiEnv({ CORS_ALLOWED_ORIGINS: varFromWranglerToml("env.preview.vars", "CORS_ALLOWED_ORIGINS") });

    const connection = async (url: string, env: Env = previewEnv) => {
      const response = await handleAgentKeys(new Request(url), env);
      return { status: response.status, body: await response.json() };
    };

    it("points a per-deployment URL at the canonical host the MCP server accepts", async () => {
      await expect(connection("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection"))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: `${STAGING_ORIGIN}/api/mcp`, hostMismatch: true },
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
      await expect(connection(`${STAGING_ORIGIN}/api/agent-keys/connection`))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: `${STAGING_ORIGIN}/api/mcp`, hostMismatch: false },
        });
      await expect(connection("http://localhost:8788/api/agent-keys/connection", mockEnv))
        .resolves.toEqual({
          status: 200,
          body: { mcpEndpoint: "http://localhost:8788/api/mcp", hostMismatch: false },
        });
    });

    it("returns no endpoint when a remote host has no configured origin", async () => {
      await expect(connection("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection", mockEnv))
        .resolves.toEqual({ status: 200, body: { mcpEndpoint: null, hostMismatch: true } });
    });

    it("requires an authenticated browser session", async () => {
      sessionMocks.getSessionUserId.mockResolvedValue(null);

      const response = await handleAgentKeys(
        new Request(`${STAGING_ORIGIN}/api/agent-keys/connection`),
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
