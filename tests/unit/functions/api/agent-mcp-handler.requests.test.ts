import { beforeEach, describe, expect, it, vi } from "vitest";
import { env, resetAgentMcpHandlerMocks, rpcErrorBody, toolBody } from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpRequest, mcpToolCall } from "../../../support/agentMcp";
import { mcpErrorResponse } from "../../../support/mcpResponses";
import { readJson } from "../../../support/readJson";
import { z } from "zod";
import { logLineIn } from "../../../support/storedJson";

const MCP_HEADERS = {
  Authorization: "Bearer test",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-06-18",
};

function rawMcpRequest(body: string, headers: Record<string, string> = MCP_HEADERS): Request {
  return new Request("http://localhost/api/mcp", { method: "POST", headers, body });
}

class BodyStreamedPastTheLimit extends Request {
  constructor() {
    super("http://localhost/api/mcp", { method: "POST", headers: MCP_HEADERS, body: "{}" });
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    return new ArrayBuffer(1024 * 1024 + 1);
  }
}

const errorWithItsId = mcpErrorResponse.extend({ id: z.unknown() });

const headersWithout = (name: keyof typeof MCP_HEADERS) =>
  Object.fromEntries(Object.entries(MCP_HEADERS).filter(([header]) => header !== name));

const rpc = (message: Record<string, unknown>) => rawMcpRequest(JSON.stringify({ jsonrpc: "2.0", ...message }));

describe("MCP requests the handler refuses at the transport", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("answers a request with no Accept header with 406 before authenticating", async () => {
    expect((await handleAgentMcp(rawMcpRequest("{}", headersWithout("Accept")), env)).status).toBe(406);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it.each(["many", "-1"])("answers a Content-Length of %j with 400 before authenticating", async (length) => {
    const response = await handleAgentMcp(rawMcpRequest("{}", { ...MCP_HEADERS, "Content-Length": length }), env);

    expect(response.status).toBe(400);
    expect((await rpcErrorBody(response)).error.message).toBe("Invalid Content-Length");
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it("answers a body streamed past 1MB without a Content-Length with 413", async () => {
    const response = await handleAgentMcp(new BodyStreamedPastTheLimit(), env);

    expect(response.status).toBe(413);
    expect((await rpcErrorBody(response)).error.message).toBe("Request body is too large");
  });
});

describe("JSON-RPC messages the handler answers without running a tool", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it.each([
    ["an object id", { id: { nested: true }, method: "ping" }],
    ["a fractional id", { id: 1.5, method: "ping" }],
  ])("answers a request with %s as an invalid request", async (_label, message) => {
    const body = await readJson(await handleAgentMcp(rpc(message), env), errorWithItsId);

    expect(body.error).toMatchObject({ code: -32600, message: "Invalid Request" });
    expect(body.id).toBeNull();
  });

  it("acknowledges a notification sent without the protocol version and runs nothing", async () => {
    const response = await handleAgentMcp(
      rawMcpRequest(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), headersWithout("MCP-Protocol-Version")),
      env,
    );

    expect(response.status).toBe(202);
  });

  it("answers a method it does not serve with -32601", async () => {
    const body = await rpcErrorBody(await handleAgentMcp(mcpRequest("resources/list"), env));

    expect(body.error).toEqual({ code: -32601, message: "Method not found" });
  });

  it.each([
    ["params that are not an object", "call everything"],
    ["no tool name", { arguments: {} }],
  ])("answers a tool call with %s with -32602", async (_label, params) => {
    const body = await rpcErrorBody(await handleAgentMcp(rpc({ id: 7, method: "tools/call", params }), env));

    expect(body.error).toEqual({ code: -32602, message: "Tool name is required" });
  });
});

it("still answers a tool call when recording the Run Key's use fails, and logs it", async () => {
  resetAgentMcpHandlerMocks();
  vi.mocked(markPersonalRunKeyUsed).mockRejectedValue(new Error("D1 busy"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  const body = await toolBody(await handleAgentMcp(mcpToolCall("list_templates"), env));

  expect(body.result.isError).toBeUndefined();
  expect(warn.mock.calls.map(([line]) => logLineIn(line).message)).toContain("mcp_key_usage_error");
  warn.mockRestore();
});
