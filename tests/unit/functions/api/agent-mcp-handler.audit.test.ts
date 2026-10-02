import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstOf } from "../../../support/elements";
import {
  dbMocks,
  env,
  everyUpdateRunOperation,
  finishedIfCompleting,
  finishedRun,
  ownedTemplate,
  personalRun,
  resetAgentMcpHandlerMocks,
  sectionsOfAtLeast,
  toolBody,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { mcpRunResult, mcpToolCall } from "../../../support/agentMcp";
import { anyInstanceOf, objectContaining } from "../../../support/asymmetricMatchers";
import { jsonRecordIn } from "../../../support/storedJson";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  describe("audit payloads", () => {
    const AUDIT_PAYLOAD_BUDGET_BYTES = 4 * 1024;

    async function recordedAudit() {
      expect(buildAuditEventValues).toHaveBeenCalledOnce();
      const result = firstOf(vi.mocked(buildAuditEventValues).mock.results);
      if (result.type !== "return") throw new Error(`buildAuditEventValues did not return: ${result.type}`);
      return result.value;
    }

    function expectCompact(payload: string | null | undefined) {
      if (payload == null) return;
      expect(payload).not.toMatch(/"items"|retired_items|share_token/);
      expect(new TextEncoder().encode(payload).byteLength).toBeLessThan(AUDIT_PAYLOAD_BUDGET_BYTES);
    }

    it("records a run summary, not its content, when start_run creates a run", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(sectionsOfAtLeast(200 * 1024))]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env));
      const audit = await recordedAudit();

      expect(body.result.isError).toBeUndefined();
      expectCompact(audit.after_json);
      expect(JSON.parse(audit.after_json ?? "{}")).toEqual(objectContaining({
        id: mcpRunResult.parse(body.result.structuredContent).run.id,
        status: "in_progress",
        revision: 1,
      }));
      expect(audit.metadata_json).toContain('"personalRunKeyName":"Codex"');
    });

    it.each(everyUpdateRunOperation({ taskId: "task-1", notes: "n".repeat(20_000) }))("records a compact %s change instead of copies of the run", async (operation, fields) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(finishedIfCompleting(operation, sectionsOfAtLeast(200 * 1024))),
        retired_items: JSON.stringify(sectionsOfAtLeast(20 * 1024)),
        revision: 4,
      })]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 4,
        operation,
        ...fields,
      }), env));
      const audit = await recordedAudit();

      expect(body.result.isError).toBeUndefined();
      for (const payload of [audit.before_json, audit.after_json, audit.diff_json]) expectCompact(payload);
      const diff = jsonRecordIn(audit.diff_json ?? "{}");
      expect(diff).toEqual(objectContaining({ operation, revision: { from: 4, to: 5 } }));
      expect(diff["progress"]).toEqual({ from: 0, to: anyInstanceOf(Number) });
      if ("taskId" in fields) expect(diff["taskId"]).toBe("task-1");
      if (operation === "set_task_notes") {
        expect(diff).toEqual(objectContaining({ notesLength: 20_000 }));
        expect(audit.diff_json).not.toContain("nnnn");
      }
      expect(JSON.parse(audit.before_json ?? "{}")).toEqual(objectContaining({ revision: 4 }));
      expect(JSON.parse(audit.after_json ?? "{}")).toEqual(objectContaining({ revision: 5 }));
    });

    it("does not rewrite run content for a status-only change", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([finishedRun({ progress: 40 })]);

      await handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_run_status",
        status: "completed",
      }), env);

      const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
      expect(updates).not.toHaveProperty("items");
      expect(updates).toEqual(objectContaining({ status: "completed", progress: 40, revision: 2 }));
      const diff = jsonRecordIn((await recordedAudit()).diff_json ?? "{}");
      expect(diff).toEqual(objectContaining({ status: "completed", progress: { from: 40, to: 40 } }));
    });
  });
});
