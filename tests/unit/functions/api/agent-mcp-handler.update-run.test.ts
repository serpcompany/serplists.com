import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dbMocks,
  env,
  finishedRun,
  personalRun,
  resetAgentMcpHandlerMocks,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpToolCall } from "../../../support/agentMcp";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("updates a subtask, synchronizes its parent, and returns the next revision", async () => {
    const run = personalRun({
      items: JSON.stringify([{
        id: "section-1",
        items: [{
          id: "task-1",
          isCompleted: false,
          contents: [{ type: "subItems", subItems: [{ id: "sub-1", isCompleted: true }, { id: "sub-2", isCompleted: false }] }],
        }],
      }]),
      revision: 3,
    });
    dbMocks.selectChain.limit.mockResolvedValueOnce([run]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 3,
      operation: "set_subtask_completed",
      taskId: "task-1",
      subtaskId: "sub-2",
      completed: true,
    }), env);
    const body = await response.json() as any;

    expect(body.result.structuredContent.run).toEqual(expect.objectContaining({ revision: 4, progress: 100 }));
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    const sections = JSON.parse(updates.items);
    expect(sections[0].items[0].isCompleted).toBe(true);
    expect(sections[0].items[0].contents[0].subItems.every((item: any) => item.isCompleted)).toBe(true);
  });

  it("returns a structured edit conflict without writing", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 4,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Verified locally",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual(expect.objectContaining({
      error: "edit_conflict",
      details: { expectedRevision: 4, currentRevision: 5 },
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("does not write an audit event when the conditional revision update loses a race", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 5,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Verified locally",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("edit_conflict");
    expect(dbMocks.updateChain.set).toHaveBeenCalledOnce();
    expect(dbMocks.db.batch).toHaveBeenCalledOnce();
    expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([
      { kind: "conditional-insert" },
      dbMocks.updateChain,
    ]);
  });

  it("matches the checklist endpoint when reopening a completed run", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      status: "completed",
      progress: 67,
      revision: 2,
      completed_at: "2026-09-19T01:00:00.000Z",
      completed_by_user_id: "user-1",
    })]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_run_status",
      status: "in_progress",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "in_progress",
      progress: 67,
    }));
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    expect(updates).not.toHaveProperty("completed_at");
    expect(updates).not.toHaveProperty("completed_by_user_id");
  });

  it("keeps the original completion stamps when a completed run is marked completed again", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      status: "completed",
      progress: 100,
      revision: 2,
      completed_at: "2026-09-19T01:00:00.000Z",
      completed_by_user_id: "user-1",
    })]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_run_status",
      status: "completed",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    expect(updates.status).toBe("completed");
    expect(updates).not.toHaveProperty("completed_at");
    expect(updates).not.toHaveProperty("completed_by_user_id");
  });

  it("stamps the completer and time when a run becomes completed", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([finishedRun({ revision: 2 })]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_run_status",
      status: "completed",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    const updates = dbMocks.updateChain.set.mock.calls[0][0];
    expect(updates.completed_by_user_id).toBe("user-1");
    expect(typeof updates.completed_at).toBe("string");
  });

  describe("completing a run with work left, which the run page would freeze with open work it cannot reopen", () => {
    const completeRun = (run: JsonRecord) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      return handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_run_status",
        status: "completed",
      }), env).then((response) => response.json() as Promise<any>);
    };
    const task = (fields: JsonRecord) => ({ id: "task-1", title: "Verify", ...fields });
    const runOf = (...tasks: JsonRecord[]) => personalRun({ items: JSON.stringify([{ id: "section-1", title: "Release", items: tasks }]) });
    const subTasks = (...flags: boolean[]) => [{
      type: "subItems",
      subItems: flags.map((isCompleted, index) => ({ id: `sub-${index + 1}`, title: `Sub ${index + 1}`, isCompleted })),
    }];

    it.each([
      ["an open task", runOf(task({ isCompleted: true, id: "task-0" }), task({ isCompleted: false })), ["task-1"]],
      ["a ticked task with an open Sub-task", runOf(task({ isCompleted: true, contents: subTasks(true, false) })), ["task-1"]],
      ["an unticked task whose Sub-tasks are done", runOf(task({ isCompleted: false, contents: subTasks(true, true) })), ["task-1"]],
      ["no tasks", personalRun({ items: JSON.stringify([{ id: "section-1", title: "Release", items: [] }]) }), []],
    ])("refuses a run with %s and writes nothing", async (_label, run, openTaskIds) => {
      const body = await completeRun(run);

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toEqual(expect.objectContaining({
        error: "run_incomplete",
        details: { openTaskCount: openTaskIds.length, openTaskIds },
      }));
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("names at most 20 open tasks", async () => {
      const body = await completeRun(runOf(...Array.from({ length: 30 }, (_, index) => task({ id: `task-${index}`, isCompleted: false }))));

      expect(body.result.structuredContent.details.openTaskCount).toBe(30);
      expect(body.result.structuredContent.details.openTaskIds).toHaveLength(20);
    });

    it("ignores open sub-items the run page never shows, on the task itself or on another block", async () => {
      const body = await completeRun(runOf(task({
        isCompleted: true,
        subItems: [{ id: "sub-8", title: "Old", isCompleted: false }],
        contents: [{ type: "text", value: "Steps", subItems: [{ id: "sub-9", title: "Hidden", isCompleted: false }] }, ...subTasks(true)],
      })));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.updateChain.set.mock.calls[0][0]).toEqual(expect.objectContaining({ status: "completed" }));
    });

    it("completes a run whose every task and Sub-task is done, legacy completed keys included", async () => {
      const body = await completeRun(runOf(
        task({ id: "task-0", completed: true }),
        task({ isCompleted: true, contents: [{ type: "subItems", subItems: [{ id: "sub-1", title: "Old", completed: true }] }] }),
      ));

      expect(body.result.isError).toBeUndefined();
      const updates = dbMocks.updateChain.set.mock.calls[0][0];
      expect(updates).toEqual(expect.objectContaining({ status: "completed", completed_by_user_id: "user-1" }));
    });
  });

  it("refuses to reopen a completed run when the Free active-run limit is reached", async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: "free", limits: { maxTemplates: 1, maxActiveRuns: 3 } });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([personalRun({ status: "completed", revision: 2 })])
      .mockResolvedValueOnce([{ count: 3 }]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_run_status",
      status: "in_progress",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual(expect.objectContaining({
      error: "limit_reached",
      details: { limit: 3, current: 3 },
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("does not check the limit for status saves on a run that is already in progress", async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: "free", limits: { maxTemplates: 1, maxActiveRuns: 3 } });
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_run_status",
      status: "in_progress",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it("rejects an impossible atomic batch result as an internal invariant", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Evidence",
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual(expect.objectContaining({
      error: "internal_invariant",
      message: "Unable to update the run safely",
    }));
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("returns a generic internal error when an atomic batch throws", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
    dbMocks.db.batch.mockRejectedValueOnce(new Error("audit constraint secret"));

    const response = await handleAgentMcp(mcpToolCall("update_run", {
      runId: "run-1",
      expectedRevision: 2,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Evidence",
    }), env);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Internal error" },
    });
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });
});
