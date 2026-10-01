import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { requestHostIsSafe, resolveAgentMcpConnection } from "@functions/api/utils/agent-mcp-host";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import type { Env } from "@functions/api/types";
import { varFromWranglerToml } from "../../../support/wranglerToml";
import { STAGING_ORIGIN } from "@/lib/seo/siteOrigin";

const baseEnv = { DB: {} } as Env;
const previewEnv: Env = { ...baseEnv, CORS_ALLOWED_ORIGINS: varFromWranglerToml("env.preview.vars", "CORS_ALLOWED_ORIGINS") };
const productionEnv: Env = {
  ...baseEnv,
  CORS_ALLOWED_ORIGINS: varFromWranglerToml("env.production.vars", "CORS_ALLOWED_ORIGINS"),
};

const envs: Array<[string, Env]> = [
  ["preview", previewEnv],
  ["production", productionEnv],
  ["FRONTEND_URL only", { ...baseEnv, FRONTEND_URL: "https://staging.serplists.com/app/" }],
  ["an invalid FRONTEND_URL before a valid allowlist", {
    ...baseEnv,
    FRONTEND_URL: "not a url",
    CORS_ALLOWED_ORIGINS: " , nope, https://Staging.SerpLists.com/ ",
  }],
  ["no configuration", baseEnv],
];

const requestOrigins = [
  "https://staging.serplists.com",
  "https://STAGING.serplists.com",
  "https://staging.serp-checklists.pages.dev",
  "https://3f2a1b9c.serp-checklists.pages.dev",
  "https://serplists.com",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
  "http://[::1]:8788",
  "https://evil.example",
];

function connectionRequest(origin: string): Request {
  return new Request(`${origin}/api/agent-keys/connection`);
}

function initializeSentByAClientTo(endpoint: string): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Host: new URL(endpoint).host,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }),
  });
}

describe("advertised MCP endpoint", () => {
  beforeEach(() => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({
      keyId: "key-1",
      userId: "user-1",
      name: "Codex",
      permissions: ["templates:read", "runs:read", "runs:write"],
    });
  });

  it("still rejects a per-deployment staging URL at the MCP endpoint", async () => {
    const response = await handleAgentMcp(
      initializeSentByAClientTo("https://3f2a1b9c.serp-checklists.pages.dev/api/mcp"),
      previewEnv,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { message: "Invalid Host" } });
  });

  it("points a per-deployment staging URL at the canonical staging host", () => {
    expect(resolveAgentMcpConnection(connectionRequest("https://3f2a1b9c.serp-checklists.pages.dev"), previewEnv))
      .toEqual({ mcpEndpoint: `${STAGING_ORIGIN}/api/mcp`, hostMismatch: true });
  });

  it("keeps the request's own endpoint on allowed and loopback hosts", () => {
    expect(resolveAgentMcpConnection(connectionRequest(STAGING_ORIGIN), previewEnv))
      .toEqual({ mcpEndpoint: `${STAGING_ORIGIN}/api/mcp`, hostMismatch: false });
    for (const origin of ["http://localhost:8788", "http://127.0.0.1:8788", "http://[::1]:8788"]) {
      expect(resolveAgentMcpConnection(connectionRequest(origin), baseEnv))
        .toEqual({ mcpEndpoint: `${origin}/api/mcp`, hostMismatch: false });
    }
  });

  it("uses FRONTEND_URL's origin, ignoring its path and trailing slash", () => {
    expect(resolveAgentMcpConnection(
      connectionRequest("https://3f2a1b9c.serp-checklists.pages.dev"),
      { ...previewEnv, FRONTEND_URL: "https://staging.serp-checklists.pages.dev/app/" },
    )).toEqual({ mcpEndpoint: "https://staging.serp-checklists.pages.dev/api/mcp", hostMismatch: true });
  });

  it("returns no endpoint for a remote host when nothing is configured", () => {
    expect(resolveAgentMcpConnection(connectionRequest("https://3f2a1b9c.serp-checklists.pages.dev"), baseEnv))
      .toEqual({ mcpEndpoint: null, hostMismatch: true });
  });

  it("does not trust a Host header that differs from the request URL", () => {
    const spoofed = new Request("https://3f2a1b9c.serp-checklists.pages.dev/api/agent-keys/connection", {
      headers: { Host: new URL(STAGING_ORIGIN).host },
    });
    expect(resolveAgentMcpConnection(spoofed, previewEnv))
      .toEqual({ mcpEndpoint: `${STAGING_ORIGIN}/api/mcp`, hostMismatch: true });
  });

  describe.each(envs)("with %s", (_name, env) => {
    it.each(requestOrigins)("advertises an endpoint the MCP server accepts when opened on %s", async (origin) => {
      const { mcpEndpoint } = resolveAgentMcpConnection(connectionRequest(origin), env);
      if (mcpEndpoint === null) return;

      expect(requestHostIsSafe(new Request(mcpEndpoint), env)).toBe(true);
      const response = await handleAgentMcp(initializeSentByAClientTo(mcpEndpoint), env);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
    });
  });

  it("keeps lookalike and unlisted hosts off the preview allowlist", () => {
    for (const origin of [
      "https://evil.example",
      "https://evilserp-checklists.pages.dev",
      "https://x.evil.pages.dev",
      "https://3f2a1b9c.serp-checklists.pages.dev",
      "https://staging.serplists.com.evil.example",
    ]) {
      expect(requestHostIsSafe(new Request(`${origin}/api/mcp`), previewEnv), origin).toBe(false);
    }
  });
});
