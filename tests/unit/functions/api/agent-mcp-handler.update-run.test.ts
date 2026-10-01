import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentAt, firstOf, present, taskIn } from "../../../support/elements";
import { storedSectionsIn } from "../../../support/storedJson";
import { z } from "zod";
import {
  callTool,
  dbMocks,
  expectAToolError,
  finishedRun,
  personalRun,
  resetAgentMcpHandlerMocks,
  rpcErrorBody,
  sendTool,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { FREE_PLAN } from "../../../fixtures/plans";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";

const openTasks = z.object({
  details: z.object({ openTaskCount: z.number(), openTaskIds: z.array(z.string()) }).passthrough(),
}).passthrough();

const updateRun = (args: JsonRecord) => callTool("update_run", { runId: "run-1", ...args });

const setTaskNotes = (expectedRevision: number, notes: string) =>
  updateRun({ expectedRevision, operation: "set_task_notes", taskId: "task-1", notes });

const setRunStatus = (status: string, expectedRevision = 2) =>
  updateRun({ expectedRevision, operation: "set_run_status", status });

function aCompletedRunAtRevision2(progress: number) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
    status: "completed",
    progress,
    revision: 2,
    completed_at: "2026-09-19T01:00:00.000Z",
    completed_by_user_id: "user-1",
  })]);
}

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

    const body = await updateRun({
      expectedRevision: 3,
      operation: "set_subtask_completed",
      taskId: "task-1",
      subtaskId: "sub-2",
      completed: true,
    });

    expect(body.result.structuredContent.run).toEqual(expect.objectContaining({ revision: 4, progress: 100 }));
    const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
    const task = taskIn(storedSectionsIn(updates.items), 0, 0);
    expect(task.isCompleted).toBe(true);
    expect(present(contentAt(task, 0).subItems, "the sub-tasks").every((item) => item.isCompleted)).toBe(true);
  });

  it("returns a structured edit conflict without writing", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);

    const body = await setTaskNotes(4, "Verified locally");

    expectAToolError(body, {
      error: "edit_conflict",
      details: { expectedRevision: 4, currentRevision: 5 },
    });
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("does not write an audit event when the conditional revision update loses a race", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const body = await setTaskNotes(5, "Verified locally");

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("edit_conflict");
    expect(dbMocks.updateChain.set).toHaveBeenCalledOnce();
    expect(dbMocks.db.batch).toHaveBeenCalledOnce();
    expect(firstOf(dbMocks.db.batch.mock.calls)[0]).toEqual([
      { kind: "conditional-insert" },
      dbMocks.updateChain,
    ]);
  });

  it("matches the checklist endpoint when reopening a completed run", async () => {
    aCompletedRunAtRevision2(67);

    const body = await setRunStatus("in_progress");

    expect(body.result.isError).toBeUndefined();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "in_progress",
      progress: 67,
    }));
    const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
    expect(updates).not.toHaveProperty("completed_at");
    expect(updates).not.toHaveProperty("completed_by_user_id");
  });

  it("keeps the original completion stamps when a completed run is marked completed again", async () => {
    aCompletedRunAtRevision2(100);

    const body = await setRunStatus("completed");

    expect(body.result.isError).toBeUndefined();
    const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
    expect(updates.status).toBe("completed");
    expect(updates).not.toHaveProperty("completed_at");
    expect(updates).not.toHaveProperty("completed_by_user_id");
  });

  it("stamps the completer and time when a run becomes completed", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([finishedRun({ revision: 2 })]);

    const body = await setRunStatus("completed");

    expect(body.result.isError).toBeUndefined();
    const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
    expect(updates.completed_by_user_id).toBe("user-1");
    expect(typeof updates.completed_at).toBe("string");
  });

  describe("completing a run with work left, which the run page would freeze with open work it cannot reopen", () => {
    const completeRun = (run: JsonRecord) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      return setRunStatus("completed", 1);
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

      expectAToolError(body, {
        error: "run_incomplete",
        details: { openTaskCount: openTaskIds.length, openTaskIds },
      });
      expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("names at most 20 open tasks", async () => {
      const body = await completeRun(runOf(...Array.from({ length: 30 }, (_, index) => task({ id: `task-${index}`, isCompleted: false }))));

      const { details } = openTasks.parse(body.result.structuredContent);
      expect(details.openTaskCount).toBe(30);
      expect(details.openTaskIds).toHaveLength(20);
    });

    it("ignores open sub-items the run page never shows, on the task itself or on another block", async () => {
      const body = await completeRun(runOf(task({
        isCompleted: true,
        subItems: [{ id: "sub-8", title: "Old", isCompleted: false }],
        contents: [{ type: "text", value: "Steps", subItems: [{ id: "sub-9", title: "Hidden", isCompleted: false }] }, ...subTasks(true)],
      })));

      expect(body.result.isError).toBeUndefined();
      expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).toEqual(expect.objectContaining({ status: "completed" }));
    });

    it("completes a run whose every task and Sub-task is done, legacy completed keys included", async () => {
      const body = await completeRun(runOf(
        task({ id: "task-0", completed: true }),
        task({ isCompleted: true, contents: [{ type: "subItems", subItems: [{ id: "sub-1", title: "Old", completed: true }] }] }),
      ));

      expect(body.result.isError).toBeUndefined();
      const updates = firstOf(dbMocks.updateChain.set.mock.calls)[0];
      expect(updates).toEqual(expect.objectContaining({ status: "completed", completed_by_user_id: "user-1" }));
    });
  });

  it("refuses to reopen a completed run when the Free active-run limit is reached", async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(FREE_PLAN);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([personalRun({ status: "completed", revision: 2 })])
      .mockResolvedValueOnce([{ count: 3 }]);

    const body = await setRunStatus("in_progress");

    expectAToolError(body, {
      error: "limit_reached",
      details: { limit: 3, current: 3 },
    });
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("does not check the limit for status saves on a run that is already in progress", async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue(FREE_PLAN);
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);

    const body = await setRunStatus("in_progress");

    expect(body.result.isError).toBeUndefined();
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it("rejects an impossible atomic batch result as an internal invariant", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

    const body = await setTaskNotes(2, "Evidence");

    expectAToolError(body, {
      error: "internal_invariant",
      message: "Unable to update the run safely",
    });
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("returns a generic internal error when an atomic batch throws", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
    dbMocks.db.batch.mockRejectedValueOnce(new Error("audit constraint secret"));

    const failed = await sendTool("update_run", { runId: "run-1", expectedRevision: 2, operation: "set_task_notes", taskId: "task-1", notes: "Evidence" });

    expect(await rpcErrorBody(failed)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Internal error" },
    });
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });
});
