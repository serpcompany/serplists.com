import { expect, vi } from "vitest";
import { objectContaining } from "./asymmetricMatchers";
import { elementAt, firstOf } from "./elements";
import { z } from "zod";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { ToolError } from "@functions/api/handlers/agentMcpTools";
import type { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";

type JsonRecord = Record<string, unknown>;

export {
  mcpArgumentsError,
  mcpErrorResponse,
  mcpResultResponse,
  mcpRunResult,
  mcpRunsPage,
  mcpTemplateResult,
  mcpTemplatesPage,
  mcpToolList,
  mcpToolResponse,
  mcpToolResult,
  type McpToolInputSchema,
} from "./mcpResponses";

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

const jsonRecord = z.record(z.string(), z.unknown());

export const asTheClientReceives = (value: unknown): unknown => JSON.parse(toJson(value));

export const pageAsTheClientReceives = (page: JsonRecord): JsonRecord => jsonRecord.parse(asTheClientReceives(page));

export const resultBytes = (value: unknown) => new TextEncoder().encode(toJson(value)).byteLength;

export function cursorMovedPastTheEnd(cursor: string): string {
  const position = jsonRecord.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
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
  sections.map((entry) => objectContaining({
    id: entry.id,
    taskCount: z.array(z.unknown()).parse(entry.items).length,
    bytes: resultBytes(entry),
  }));

export function sectionFieldsOfTheFirstTwoPages(pages: JsonRecord[]) {
  expect(pages.length).toBeGreaterThan(3);
  const sections = pages.map((page) => jsonRecord.parse(page.section));
  const first = firstOf(sections);
  const second = elementAt(sections, 1);
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
