import { beforeEach, describe, expect, it } from "vitest";
import {
  dbMocks,
  env,
  getRunWithinTheBound,
  personalRun,
  resetAgentMcpHandlerMocks,
  sectionsOfAtLeast,
  toolBody,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { toJson } from "@functions/api/handlers/agentMcpPages";
import { runView } from "@functions/api/handlers/agentMcpRunPages";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import { authenticateWithAFreshRunKey, mcpToolCall } from "../../../support/agentMcp";
import { readRunInFull } from "../../../support/runPages";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("returns retired work from get_run but keeps list_runs small", async () => {
    const retired = [
      { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "Check DNS", isCompleted: true, notes: "TTL lowered" } },
    ];
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);

    const getResponse = await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1" }), env);
    const getBody = await getResponse.json() as any;
    expect(getBody.result.structuredContent.run.retiredItems).toEqual(retired);

    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);
    const listResponse = await handleAgentMcp(mcpToolCall("list_runs"), env);
    const listBody = await listResponse.json() as any;
    expect(listBody.result.structuredContent.runs[0]).not.toHaveProperty("retiredItems");
    expect(listBody.result.structuredContent.runs[0]).not.toHaveProperty("sections");
  });

  describe("sub-items the run page never shows", () => {
    const hiddenOnTask = [{ id: "sub-8", title: "Old", isCompleted: false }];
    const hiddenOnText = [{ id: "sub-9", title: "Hidden", isCompleted: false }];
    const visible = [{ id: "sub-1", title: "Tests pass", isCompleted: false }];
    const taskWithHidden = (id: string) => ({
      id,
      title: "Verify",
      isCompleted: false,
      subItems: hiddenOnTask,
      contents: [{ type: "text", value: "Steps", subItems: hiddenOnText }, { type: "subItems", value: "", subItems: visible }],
    });
    const run = () => personalRun({
      items: JSON.stringify([{ id: "section-1", title: "Release", items: [taskWithHidden("task-1")] }]),
      retired_items: JSON.stringify([
        { kind: "item", sectionId: "section-1", item: taskWithHidden("task-old") },
        { kind: "section", section: { id: "section-old", title: "Old", items: [taskWithHidden("task-older")] } },
      ]),
    });

    function expectOnlySubTasks(task: any) {
      expect(task).not.toHaveProperty("subItems");
      expect(task.contents[0]).not.toHaveProperty("subItems");
      expect(task.contents[1].subItems).toEqual([expect.objectContaining({ id: "sub-1" })]);
    }

    it("leaves them out of get_run, live and retired", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1" }), env));
      const { sections, retiredItems } = body.result.structuredContent.run;

      expectOnlySubTasks(sections[0].items[0]);
      expectOnlySubTasks(retiredItems[0].item);
      expectOnlySubTasks(retiredItems[1].section.items[0]);
    });

    it("leaves them out of the task update_run returns, but keeps the stored ones on the task", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Checked",
      }), env));

      expect(body.result.isError).toBeUndefined();
      expectOnlySubTasks(body.result.structuredContent.task);
      const stored = JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].items);
      expect(stored[0].items[0].subItems).toEqual([expect.objectContaining({ id: "sub-8" })]);
    });
  });

  describe("retired work", () => {
    function retiredSection(id: string, taskCount: number, notesLength: number): JsonRecord {
      const items = Array.from({ length: taskCount }, (_, index) => ({
        id: `${id}-task-${index}`,
        title: `Old ${index}`,
        isCompleted: true,
        notes: "x".repeat(notesLength),
      }));
      return { kind: "section", section: { id, title: `Retired ${id}`, items } };
    }
    const retiredTask = {
      kind: "item",
      sectionId: "section-1",
      sectionTitle: "Release",
      item: { id: "task-dns", title: "Check DNS", isCompleted: true, notes: "TTL lowered" },
    };
    const retiredSubtask = {
      kind: "subItem",
      sectionId: "section-1",
      itemId: "task-1",
      itemTitle: "Verify",
      subItem: { id: "sub-3", title: "Old check", isCompleted: true },
    };
    const runWithARetiredSectionOverTheBound = personalRun({
      retired_items: JSON.stringify([retiredSection("old-section", 2, 30_000), retiredTask, retiredSubtask]),
    });

    function getRun(run: JsonRecord, args: JsonRecord = {}) {
      authenticateWithAFreshRunKey(authenticatePersonalRunKey);
      return getRunWithinTheBound(run, args);
    }

    it("reads retired work with retired: true, all of it or one section's or task's", async () => {
      const whole = await getRun(runWithARetiredSectionOverTheBound);
      expect(whole.structuredContent).toMatchObject({ sectionsOmitted: true, run: { retiredCount: 3 } });

      const section = await getRun(runWithARetiredSectionOverTheBound, { retired: true, sectionId: "section-1" });
      expect(section.structuredContent).toEqual({ run: { id: "run-1", revision: 1 }, retiredItems: [retiredTask, retiredSubtask] });
      expect(section.content[0].text).toMatch(/^Loaded 2 retired entries\./);

      const task = await getRun(runWithARetiredSectionOverTheBound, { retired: true, taskId: "task-1" });
      expect(task.structuredContent.retiredItems).toEqual([retiredSubtask]);

      const oldTask = await getRun(runWithARetiredSectionOverTheBound, { retired: true, sectionId: "old-section", taskId: "old-section-task-1" });
      expect(oldTask.structuredContent.retiredItems).toEqual([{
        kind: "section",
        section: {
          id: "old-section",
          title: "Retired old-section",
          items: [expect.objectContaining({ id: "old-section-task-1", notes: "x".repeat(30_000) })],
        },
      }]);

      const live = await getRun(runWithARetiredSectionOverTheBound, { sectionId: "old-section" });
      expect(live.structuredContent).toMatchObject({ error: "section_not_found" });
      expect(live.structuredContent.message).toContain("retired: true");
    });

    it.each([
      ["a large retired section", runWithARetiredSectionOverTheBound],
      ["large live and retired work in the same section", personalRun({
        items: JSON.stringify(sectionsOfAtLeast(600 * 1024)),
        retired_items: JSON.stringify([
          retiredSection("gone", 40, 15_000),
          ...Array.from({ length: 60 }, (_, index) => ({
            kind: "item",
            sectionId: "section-1",
            item: { id: `retired-${index}`, title: `Retired ${index}`, isCompleted: false, notes: "y".repeat(10_000) },
          })),
          retiredSubtask,
        ]),
      })],
    ])("reads every part of a run with %s through the MCP", async (_label, run) => {
      const view = runView(run);

      const { run: read, results } = await readRunInFull(async (args) => (await getRun(run, args)).structuredContent, "run-1");

      expect(read).toEqual(JSON.parse(toJson({ ...view.header, sections: view.sections, retiredItems: view.retired })));
      expect(results.some((result) => result.part !== undefined)).toBe(true);
    });
  });

  it("hides a personal run owned by another user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);

    const response = await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("run_not_found");
  });
});
