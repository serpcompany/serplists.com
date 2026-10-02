import { vi } from "vitest";
import { z } from "zod";
import { toJson } from "@functions/api/handlers/agentMcpPages";
import { ToolError } from "@functions/api/handlers/agentMcpTools";
import type { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";

type JsonRecord = Record<string, unknown>;

export const runKeyWithEveryPermission = {
  keyId: "key-1",
  userId: "user-1",
  name: "Codex",
  permissions: ["templates:read", "templates:write", "runs:read", "runs:write"] as const,
};

export function mcpRequest(method: string, params?: unknown, id: number | undefined = 1): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(method === "initialize" ? {} : { "MCP-Protocol-Version": "2025-06-18" }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) }),
  });
}

export const mcpToolCall = (name: string, args: JsonRecord = {}, id = 1): Request =>
  mcpRequest("tools/call", { name, arguments: args }, id);

let freshRunKeys = 0;

export function authenticateWithAFreshRunKey(authenticate: typeof authenticatePersonalRunKey) {
  freshRunKeys += 1;
  vi.mocked(authenticate).mockResolvedValue({ ...runKeyWithEveryPermission, keyId: `fresh-run-key-${freshRunKeys}` });
}

export const asTheClientReceives = <T>(value: T): T => JSON.parse(toJson(value));

export const resultBytes = (value: unknown) => new TextEncoder().encode(toJson(value)).byteLength;

const cursorPositionSchema = z.record(z.string(), z.unknown());

export function cursorMovedPastTheEnd(cursor: string): string {
  const position = cursorPositionSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  return Buffer.from(JSON.stringify({ ...position, u: 5_000 })).toString("base64url");
}

export function toolErrorOf(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error("expected a ToolError");
}
