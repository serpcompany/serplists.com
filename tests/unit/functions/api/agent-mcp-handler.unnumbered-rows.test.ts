import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstOf } from "../../../support/elements";
import { callTool, dbMocks, ownedTemplate, personalRun, resetAgentMcpHandlerMocks } from "../../../support/agentMcpHandler";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { mcpRunResult } from "../../../support/agentMcp";
import { objectContaining } from "../../../support/asymmetricMatchers";
import { jsonRecordIn } from "../../../support/storedJson";
import { releaseSectionWithTwoSubTasks } from "../../../fixtures/handlerRows";

const TEXT_IN_A_NUMBER_COLUMN = "legacy";

async function recordedAudit() {
  const result = firstOf(vi.mocked(buildAuditEventValues).mock.results);
  if (result.type !== "return") throw new Error(`buildAuditEventValues did not return: ${result.type}`);
  return result.value;
}

describe("MCP tools over rows stored with text where the API counts by numbers", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("starts a run of a Template stored with text for its content version at template version 1", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { ...ownedTemplate(releaseSectionWithTwoSubTasks({ title: "Verify" })), content_version: TEXT_IN_A_NUMBER_COLUMN },
    ]);

    const body = await callTool("start_run", { templateId: "template-1" });

    expect(body.result.isError).toBeUndefined();
    expect(mcpRunResult.parse(body.result.structuredContent).run).toMatchObject({ revision: 1, templateVersion: 1 });
    expect(jsonRecordIn((await recordedAudit()).after_json)).toEqual(objectContaining({ template_version: 1 }));
  });

  it("reads a run stored with text for its revision and template version as revision 1 of template version 1", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: TEXT_IN_A_NUMBER_COLUMN, template_version: TEXT_IN_A_NUMBER_COLUMN })]);

    const body = await callTool("get_run", { runId: "run-1" });

    expect(mcpRunResult.parse(body.result.structuredContent).run).toMatchObject({ revision: 1, templateVersion: 1 });
  });
});
