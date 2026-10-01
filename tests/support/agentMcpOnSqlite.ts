import { vi } from "vitest";
import { SqliteD1 } from "./sqlite-d1";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { authenticateWithAFreshRunKey, mcpToolCall } from "./agentMcp";
import { apiEnv } from "./apiEnv";
import { jsonObject, readJson } from "./readJson";

let requests = 0;

export function openAFreshMcpDatabase(): SqliteD1 {
  vi.clearAllMocks();
  vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
  return new SqliteD1();
}

export async function callToolWithAFreshRunKey(d1: SqliteD1, name: string, args: Record<string, unknown>) {
  requests += 1;
  authenticateWithAFreshRunKey(authenticatePersonalRunKey);
  const response = await handleAgentMcp(mcpToolCall(name, args, requests), apiEnv({ DB: d1.binding }));
  return readJson(response, jsonObject);
}
