import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { keyAllowsTool } from "@functions/api/handlers/agentMcpTools";
import { createTemplateForUser } from "@functions/api/handlers/template-create";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { authenticateWithAFreshRunKey, mcpErrorResponse, mcpToolCall, mcpToolResponse } from "../../../support/agentMcp";
import { apiEnv } from "../../../support/apiEnv";
import { readJson } from "../../../support/readJson";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

vi.mock("@functions/api/handlers/agentMcpTools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@functions/api/handlers/agentMcpTools")>();
  return { ...actual, keyAllowsTool: vi.fn(actual.keyAllowsTool) };
});

vi.mock("@functions/api/handlers/template-create", async (importOriginal) => ({
  ...await importOriginal<typeof import("@functions/api/handlers/template-create")>(),
  createTemplateForUser: vi.fn(),
}));

function send(name: string, args: Record<string, unknown> = {}) {
  authenticateWithAFreshRunKey(authenticatePersonalRunKey);
  return handleAgentMcp(mcpToolCall(name, args), apiEnv());
}

describe("the MCP dispatcher's answers for what no tool it knows returns", () => {
  beforeEach(() => {
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("refuses a tool name it has no case for with tool_not_found, even when the Run Key check lets the name through", async () => {
    vi.mocked(keyAllowsTool).mockReturnValueOnce(true);

    const body = await readJson(await send("archive_everything"), mcpErrorResponse);

    expect(body.error).toEqual({ code: -32602, message: "Unknown tool: archive_everything", data: { code: "tool_not_found" } });
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("names a template write refused with a status it has no code for template_write_failed", async () => {
    vi.mocked(createTemplateForUser).mockResolvedValueOnce({ refused: { message: "Storage is unavailable", status: 503 } });

    const body = await readJson(await send("create_template", {
      title: "Release SOP",
      sections: [{ title: "Ship", items: [{ title: "Tag the release" }] }],
    }), mcpToolResponse);

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual({ error: "template_write_failed", message: "Storage is unavailable" });
  });
});
