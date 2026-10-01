import { vi } from "vitest";
import { SqliteD1 } from "./sqlite-d1";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { authenticateWithAFreshRunKey, mcpErrorResponse, mcpToolCall, mcpToolResponse } from "./agentMcp";
import { apiEnv } from "./apiEnv";
import { readJson } from "./readJson";

let requests = 0;

export function openAFreshMcpDatabase(): SqliteD1 {
  vi.clearAllMocks();
  vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
  return new SqliteD1();
}

function sendToolWithAFreshRunKey(d1: SqliteD1, name: string, args: Record<string, unknown>) {
  requests += 1;
  authenticateWithAFreshRunKey(authenticatePersonalRunKey);
  return handleAgentMcp(mcpToolCall(name, args, requests), apiEnv({ DB: d1.binding }));
}

export async function callToolWithAFreshRunKey(d1: SqliteD1, name: string, args: Record<string, unknown>) {
  return readJson(await sendToolWithAFreshRunKey(d1, name, args), mcpToolResponse);
}

export async function refusedToolCallWithAFreshRunKey(d1: SqliteD1, name: string, args: Record<string, unknown>) {
  return readJson(await sendToolWithAFreshRunKey(d1, name, args), mcpErrorResponse);
}
