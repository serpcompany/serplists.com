import { expect, vi } from "vitest";
import { z } from "zod";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { ToolError } from "@functions/api/handlers/agentMcpTools";
import type { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import { jsonObject } from "./readJson";

type JsonRecord = Record<string, unknown>;

export const mcpToolResult = z.object({
  content: z.array(z.object({ type: z.literal("text"), text: z.string() }).passthrough()),
  structuredContent: jsonObject,
  isError: z.literal(true).optional(),
}).passthrough();

export const mcpToolResponse = z.object({ jsonrpc: z.literal("2.0"), result: mcpToolResult }).passthrough();

export const mcpResultResponse = z.object({ jsonrpc: z.literal("2.0"), result: jsonObject }).passthrough();

export const mcpErrorResponse = z.object({
  jsonrpc: z.literal("2.0"),
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).passthrough(),
}).passthrough();

const mcpToolInputSchema = z.object({
  type: z.string(),
  properties: z.record(z.object({
    type: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    description: z.string().optional(),
  }).passthrough()),
  required: z.array(z.string()).optional(),
}).passthrough();

export type McpToolInputSchema = z.output<typeof mcpToolInputSchema>;

export const mcpToolList = z.object({
  jsonrpc: z.literal("2.0"),
  result: z.object({
    tools: z.array(z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: mcpToolInputSchema,
      annotations: z.object({ readOnlyHint: z.boolean() }).passthrough(),
    }).passthrough()),
  }).passthrough(),
}).passthrough();

export const mcpArgumentsError = mcpErrorResponse.extend({
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.object({ code: z.string(), details: z.object({ issues: z.array(jsonObject) }).passthrough() }).passthrough(),
  }).passthrough(),
});

export const mcpRunResult = z.object({ run: z.object({ id: z.string(), revision: z.number() }).passthrough() }).passthrough();

export const mcpTemplateResult = z.object({
  template: z.object({ id: z.string(), version: z.number() }).passthrough(),
}).passthrough();

export const mcpTemplatesPage = z.object({ templates: z.array(jsonObject), nextCursor: z.string().optional() }).passthrough();

export const mcpRunsPage = z.object({ runs: z.array(jsonObject), nextCursor: z.string().optional() }).passthrough();

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

export const outlineOf = (sections: JsonRecord[]) =>
  sections.map((entry) => expect.objectContaining({
    id: entry.id,
    taskCount: (entry.items as unknown[]).length,
    bytes: resultBytes(entry),
  }));

export function sectionFieldsOfTheFirstTwoPages(pages: JsonRecord[]) {
  expect(pages.length).toBeGreaterThan(3);
  const [first, second] = pages.map((page) => page.section as JsonRecord);
  expect(first).toMatchObject({ id: "big", title: "Section big", taskCount: 200, firstTask: 0 });
  return { first, second };
}

export function expectReadBackInFullWithinTheBound(readBack: unknown, whole: unknown, results: JsonRecord[], seed: number) {
  expect(readBack, `seed ${seed}`).toEqual(asTheClientReceives(whole));
  expect(results.every((result) => resultBytes(result) <= MAX_RESULT_BYTES), `seed ${seed}`).toBe(true);
}

export function expectAnInvalidCursor(action: () => unknown) {
  const error = toolErrorOf(action);
  expect(error.code).toBe("invalid_arguments");
  expect(error.message).toMatch(/^cursor: /);
}
