import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dbMocks,
  env,
  ownedTemplate,
  resetAgentMcpHandlerMocks,
  sectionsOfAtLeast,
  toolBody,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import {
  RUN_SECTIONS_WITH_LEGACY_IDS,
  TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS,
  TEMPLATE_SECTIONS_CARRYING_RUN_STATE,
  UNTICKED_RUN_SECTIONS,
} from "../../../fixtures/runStartFixtures";
import { mcpToolCall } from "../../../support/agentMcp";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("starts a persistent personal run from an owned template snapshot", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      id: "template-1",
      user_id: "user-1",
      owner_type: "user",
      team_id: null,
      deleted_at: null,
      title: "Release SOP",
      items: JSON.stringify([{
        id: "section-1",
        title: "Release",
        items: [{ id: "task-1", title: "Verify", isCompleted: true }],
      }]),
      content_version: 4,
    }]);

    const response = await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent.run).toEqual(expect.objectContaining({
      templateId: "template-1",
      title: "Release SOP",
      revision: 1,
    }));
    const inserted = dbMocks.insertChain.values.mock.calls[0][0];
    expect(inserted.user_id).toBe("user-1");
    expect(inserted.team_id).toBeNull();
    expect(JSON.parse(inserted.items)[0].items[0].isCompleted).toBe(false);
    expect(dbMocks.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      action: "checklist_run.created",
      metadata_json: expect.stringContaining('"personalRunKeyId":"key-1"'),
    }));
  });

  it.each([
    ["", TEMPLATE_SECTIONS_CARRYING_RUN_STATE, UNTICKED_RUN_SECTIONS],
    [" and the ids its Template's next save stores", TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS, RUN_SECTIONS_WITH_LEGACY_IDS],
  ])("starts a run with every task and Sub-task unticked%s, exactly as a web start stores it", async (_ids, templateSections, runSections) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{
      id: "template-1",
      user_id: "user-1",
      owner_type: "user",
      team_id: null,
      deleted_at: null,
      title: "Release SOP",
      items: JSON.stringify(templateSections),
      content_version: 2,
    }]);

    const response = await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    expect(JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items)).toEqual(runSections);
  });

  describe("Free plan active run limit", () => {
    const freePlan = { plan: "free", limits: { maxTemplates: 1, maxActiveRuns: 3 } } as const;
    const renderSql = (query: unknown) => new SQLiteSyncDialect().sqlToQuery(query as SQL);

    beforeEach(() => {
      vi.mocked(getEntitlementsForUser).mockResolvedValue(freePlan as any);
    });

    it("rejects start_run when a concurrent start filled the limit after the pre-check", async () => {
      const preCheckLeavingOneSlot = [{ count: 2 }];
      const recountAfterTheGuardedInsertIsRefused = [{ count: 3 }];
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([ownedTemplate(sectionsOfAtLeast(1))])
        .mockResolvedValueOnce(preCheckLeavingOneSlot)
        .mockResolvedValueOnce(recountAfterTheGuardedInsertIsRefused);
      dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toEqual(expect.objectContaining({
        error: "limit_reached",
        details: { limit: 3, current: 3 },
      }));
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("inserts the run and its audit event only while the owner is under the limit", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([ownedTemplate(sectionsOfAtLeast(1))])
        .mockResolvedValueOnce([{ count: 2 }]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
      expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([{ kind: "conditional-insert" }, { kind: "conditional-insert" }]);

      const [runInsert, auditInsert] = dbMocks.insertChain.select.mock.calls.map(([query]) => renderSql(query));
      expect(runInsert.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where .*"status" = \? .*\) < \?$/s);
      expect(runInsert.params.at(-1)).toBe(3);
      expect(runInsert.params).toEqual(expect.arrayContaining([body.result.structuredContent.run.id, "user-1", "in_progress"]));
      expect(auditInsert.sql).toMatch(/where exists \(select 1 from "checklist_runs" where "checklist_runs"\."id" = \?\)$/s);
      expect(auditInsert.params.at(-1)).toBe(body.result.structuredContent.run.id);
    });

    it("keeps a plain insert for plans without an active run limit", async () => {
      vi.mocked(getEntitlementsForUser).mockResolvedValue({
        plan: "pro",
        limits: { maxTemplates: null, maxActiveRuns: null },
      });
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(sectionsOfAtLeast(1))]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.insertChain.select).not.toHaveBeenCalled();
      expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([{ kind: "insert" }, { kind: "insert" }]);
    });
  });
});
