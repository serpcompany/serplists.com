import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { listTemplates } from "@functions/api/handlers/agentMcpLists";
import { byteSize, MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import { startRun } from "@functions/api/handlers/agentMcpRunTools";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpToolCall, mcpToolResponse, runKeyWithEveryPermission } from "../../../support/agentMcp";
import { apiEnv } from "../../../support/apiEnv";
import { firstOf } from "../../../support/elements";
import { readJson } from "../../../support/readJson";
import { logLineIn } from "../../../support/storedJson";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

vi.mock("@functions/api/handlers/agentMcpLists", async (importOriginal) => ({
  ...await importOriginal<typeof import("@functions/api/handlers/agentMcpLists")>(),
  listTemplates: vi.fn(),
}));

vi.mock("@functions/api/handlers/agentMcpRunTools", async (importOriginal) => ({
  ...await importOriginal<typeof import("@functions/api/handlers/agentMcpRunTools")>(),
  startRun: vi.fn(),
}));

const overTheBound = "x".repeat(MAX_RESULT_BYTES);

async function call(name: string) {
  const request = mcpToolCall(name, {});
  request.headers.set("X-Request-Id", "req-bound");
  return readJson(await handleAgentMcp(request, apiEnv()), mcpToolResponse);
}

function errorLines(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map((args) => logLineIn(firstOf(args)));
}

describe("the MCP dispatcher's check of every result against the bound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(runKeyWithEveryPermission);
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a read whose result comes back over the bound, so the agent never gets a result it can't hold", async () => {
    vi.mocked(listTemplates).mockResolvedValue({ templates: [{ id: "template-1", title: overTheBound }] });

    const body = await call("list_templates");

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual({
      error: "result_too_large",
      message: "Result is too large to return",
      details: { limit: MAX_RESULT_BYTES },
    });
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("returns a write's result over the bound, since the write has committed, and logs mcp_result_too_large with its size", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = { id: "run-1", title: "Release SOP", notes: overTheBound };
    vi.mocked(startRun).mockResolvedValue({ run });

    const body = await call("start_run");

    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toEqual({ run });
    expect(firstOf(body.result.content).text).toMatch(/^Started run "Release SOP"\./);
    expect(markPersonalRunKeyUsed).toHaveBeenCalledOnce();
    expect(errorLines(error)).toContainEqual(expect.objectContaining({
      level: "error",
      message: "mcp_result_too_large",
      requestId: "req-bound",
      keyId: runKeyWithEveryPermission.keyId,
      tool: "start_run",
      bytes: byteSize({ run }),
    }));
  });

  it("logs nothing for a write whose result fits", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(startRun).mockResolvedValue({ run: { id: "run-1", title: "Release SOP" } });

    const body = await call("start_run");

    expect(body.result.isError).toBeUndefined();
    expect(errorLines(error)).toEqual([]);
  });
});
