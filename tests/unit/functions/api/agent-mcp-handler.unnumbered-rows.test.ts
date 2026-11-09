import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstOf } from "../../../support/elements";
import { callTool, dbMocks, ownedTemplate, personalRun, resetAgentMcpHandlerMocks } from "../../../support/agentMcpHandler";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { mcpRunResult } from "../../../support/agentMcp";
import { objectContaining } from "../../../support/asymmetricMatchers";
import { jsonRecordIn } from "../../../support/storedJson";
import { releaseSectionWithTwoSubTasks } from "../../../fixtures/handlerRows";

const NO_NUMBER = null;

async function recordedAudit() {
  const result = firstOf(vi.mocked(buildAuditEventValues).mock.results);
  if (result.type !== "return") throw new Error(`buildAuditEventValues did not return: ${result.type}`);
  return result.value;
}

describe("MCP tools over rows stored without the numbers the API counts by", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("starts a run of a Template stored without a content version at template version 1", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { ...ownedTemplate(releaseSectionWithTwoSubTasks({ title: "Verify" })), content_version: NO_NUMBER },
    ]);

    const body = await callTool("start_run", { templateId: "template-1" });

    expect(body.result.isError).toBeUndefined();
    expect(mcpRunResult.parse(body.result.structuredContent).run).toMatchObject({ revision: 1, templateVersion: 1 });
    expect(jsonRecordIn((await recordedAudit()).after_json)).toEqual(objectContaining({ template_version: 1 }));
  });

  it("reads a run stored without a revision or a template version as revision 1 of template version 1", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: NO_NUMBER, template_version: NO_NUMBER })]);

    const body = await callTool("get_run", { runId: "run-1" });

    expect(mcpRunResult.parse(body.result.structuredContent).run).toMatchObject({ revision: 1, templateVersion: 1 });
  });

  it("updates a run stored without a revision as revision 1, saving and recording it as revision 2", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: NO_NUMBER })]);

    const body = await callTool("update_run", {
      runId: "run-1",
      expectedRevision: 1,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Checked",
    });

    expect(body.result.isError).toBeUndefined();
    expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).toEqual(objectContaining({ revision: 2 }));
    expect(jsonRecordIn((await recordedAudit()).diff_json)).toEqual(objectContaining({ revision: { from: 1, to: 2 } }));
  });
});
