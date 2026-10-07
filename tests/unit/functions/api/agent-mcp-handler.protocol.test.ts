import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMocks, env, resetAgentMcpHandlerMocks } from "../../../support/agentMcpHandler";
import { handleAgentMcp, MCP_SERVER_VERSION } from "@functions/api/handlers/agentMcp";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import {
  mcpArgumentsError,
  mcpErrorResponse,
  mcpRequest,
  mcpResultResponse,
  mcpToolCall,
  runKeyWithEveryPermission,
} from "../../../support/agentMcp";
import { readJson } from "../../../support/readJson";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("requires bearer authentication", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const response = await handleAgentMcp(mcpRequest("initialize"), env);
    const body = await readJson(response, mcpErrorResponse);

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Unauthorized");
  });

  it("rejects non-POST methods before authentication", async () => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp"), env);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it.each([
    [{ "Content-Type": "text/plain", Accept: "application/json, text/event-stream" }, 415],
    [{ "Content-Type": "application/json", Accept: "application/json" }, 406],
    [{ "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Content-Length": "1048577" }, 413],
  ])("rejects invalid transport headers", async (extraHeaders, expectedStatus) => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer test", ...extraHeaders },
      body: "{}",
    }), env);
    expect(response.status).toBe(expectedStatus);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it("rejects cross-origin browser requests and mismatched hosts", async () => {
    const disallowedOrigin = new Request("https://staging.serplists.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Origin: "https://evil.example",
      },
      body: "{}",
    });
    expect((await handleAgentMcp(disallowedOrigin, {
      ...env,
      FRONTEND_URL: "https://staging.serplists.com",
    })).status).toBe(403);

    const mismatchedHost = new Request("https://staging.serplists.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Host: "evil.example",
      },
      body: "{}",
    });
    expect((await handleAgentMcp(mismatchedHost, env)).status).toBe(403);
  });

  it("counter-offers the supported protocol version during initialization", async () => {
    const response = await handleAgentMcp(mcpRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }), env);
    const body = await readJson(response, mcpResultResponse);
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("names the server version, with release notes in the product spec that tell agents already using the MCP what it changes", async () => {
    const response = await handleAgentMcp(mcpRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }), env);
    const body = await readJson(response, mcpResultResponse);
    expect(body.result.serverInfo).toEqual({ name: "serp-lists-personal-runs", version: "0.6.0" });

    const spec = readFileSync(new URL("../../../../docs/product-specs/features.md", import.meta.url), "utf8");
    expect(spec).toContain("\n## MCP Changes For Agents\n");
    const notes = spec.slice(spec.indexOf("\n## MCP Changes For Agents\n"));
    expect(notes).toMatch(new RegExp(`^### ${MCP_SERVER_VERSION.replace(/\./g, "\\.")} `, "m"));
  });

  it("rejects invalid request ids and incomplete initialize parameters", async () => {
    const validRequest = mcpRequest("ping");
    for (const invalidRequestId of [null, 1.5, { invalid: true }, false]) {
      const invalidId = await handleAgentMcp(new Request(validRequest.url, {
        method: "POST",
        headers: validRequest.headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: invalidRequestId, method: "ping" }),
      }), env);
      expect(await invalidId.json()).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      });
    }

    const malformedEnvelope = await handleAgentMcp(new Request(validRequest.url, {
      method: "POST",
      headers: validRequest.headers,
      body: JSON.stringify({ jsonrpc: "1.0", id: 1.5, method: "ping" }),
    }), env);
    expect(await malformedEnvelope.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });

    const incomplete = await handleAgentMcp(mcpRequest("initialize", {
      protocolVersion: "2025-06-18",
    }), env);
    expect((await readJson(incomplete, mcpErrorResponse)).error.code).toBe(-32602);
  });

  it("requires the negotiated protocol header after initialization", async () => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env);
    const body = await readJson(response, mcpErrorResponse);
    expect(response.status).toBe(400);
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toContain("MCP-Protocol-Version");
  });

  it("returns safe JSON-RPC errors for malformed and unexpected requests", async () => {
    const malformed = mcpRequest("ping");
    const malformedResponse = await handleAgentMcp(new Request(malformed.url, {
      method: "POST",
      headers: malformed.headers,
      body: "{broken",
    }), env);
    expect((await readJson(malformedResponse, mcpErrorResponse)).error.code).toBe(-32700);

    dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("sensitive database detail"));
    const failed = await handleAgentMcp(mcpToolCall("list_templates"), env);
    const body = await readJson(failed, mcpErrorResponse);
    expect(body.error).toEqual({ code: -32603, message: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });

  it("accepts authenticated notifications with an empty 202 response", async () => {
    const request = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    const response = await handleAgentMcp(request, env);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("returns protocol errors for unknown tools and invalid tool arguments", async () => {
    const unknownResponse = await handleAgentMcp(mcpToolCall("not_a_tool"), env);
    const unknown = await readJson(unknownResponse, mcpErrorResponse);
    expect(unknown.error).toEqual({
      code: -32602,
      message: "Unknown tool: not_a_tool",
      data: { code: "tool_not_found" },
    });

    const invalidResponse = await handleAgentMcp(mcpToolCall("get_run", {}), env);
    const invalid = await readJson(invalidResponse, mcpArgumentsError);
    expect(invalid.error.code).toBe(-32602);
    expect(invalid.error.data.code).toBe("invalid_arguments");
  });

  it("applies a process-local request limit per key", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...runKeyWithEveryPermission, keyId: "rate-limited-key" });
    for (let index = 0; index < 120; index += 1) {
      const response = await handleAgentMcp(mcpRequest("ping", undefined, index + 1), env);
      expect(response.status).toBe(200);
    }
    const limited = await handleAgentMcp(mcpRequest("ping", undefined, 999), env);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("refuses an IP that keeps failing authentication before reading D1", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const fromIp = () => {
      const request = mcpRequest("ping");
      request.headers.set("CF-Connecting-IP", "203.0.113.7");
      return request;
    };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await handleAgentMcp(fromIp(), env)).status).toBe(401);
    }
    vi.mocked(authenticatePersonalRunKey).mockClear();

    const blocked = await handleAgentMcp(fromIp(), env);
    expect(blocked.status).toBe(429);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();

    const otherIp = mcpRequest("ping");
    otherIp.headers.set("CF-Connecting-IP", "203.0.113.8");
    expect((await handleAgentMcp(otherIp, env)).status).toBe(401);
  });

  it("counts failed authentication from IPv6 addresses per /64, like the router's limits", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const fromIp = (ip: string) => {
      const request = mcpRequest("ping");
      request.headers.set("CF-Connecting-IP", ip);
      return request;
    };
    const newAddressInTheSame64 = (attempt: number) => `2001:db8:5:6::${(attempt + 1).toString(16)}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await handleAgentMcp(fromIp(newAddressInTheSame64(attempt)), env)).status).toBe(401);
    }
    vi.mocked(authenticatePersonalRunKey).mockClear();

    expect((await handleAgentMcp(fromIp("2001:db8:5:6:ffff::1"), env)).status).toBe(429);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
    expect((await handleAgentMcp(fromIp("2001:db8:5:7::1"), env)).status).toBe(401);
  });
});
