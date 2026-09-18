import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };
  return { db, insertChain, selectChain, updateChain };
});

vi.mock("drizzle-orm/d1", () => ({ drizzle: vi.fn(() => dbMocks.db) }));

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
}));

vi.mock("@functions/api/utils/entitlements", () => ({
  getEntitlementsForUser: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";

const identity = { keyId: "key-1", userId: "user-1", name: "Codex" };
const env = { DB: {} } as any;

function rpcRequest(method: string, params?: unknown, id: number | undefined = 1): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) }),
  });
}

function callTool(name: string, args: JsonRecord = {}, id = 1): Request {
  return rpcRequest("tools/call", { name, arguments: args }, id);
}

type JsonRecord = Record<string, unknown>;

function personalRun(overrides: JsonRecord = {}): JsonRecord {
  return {
    id: "run-1",
    user_id: "user-1",
    team_id: null,
    template_id: "template-1",
    title: "Release SOP",
    items: JSON.stringify([{
      id: "section-1",
      title: "Release",
      items: [{
        id: "task-1",
        title: "Verify",
        isCompleted: false,
        contents: [{
          type: "subItems",
          subItems: [
            { id: "sub-1", title: "Tests pass", isCompleted: false },
            { id: "sub-2", title: "Preview checked", isCompleted: false },
          ],
        }],
      }],
    }]),
    status: "in_progress",
    progress: 0,
    revision: 1,
    template_version: 2,
    started_at: "2026-09-19T00:00:00.000Z",
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: null,
    deleted_at: null,
    ...overrides,
  };
}

describe("personal run MCP handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue({ kind: "insert" });
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockResolvedValue({ meta: { changes: 1 } });
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(identity);
    vi.mocked(getEntitlementsForUser).mockResolvedValue({
      plan: "pro",
      limits: { maxTemplates: null, maxActiveRuns: null },
    });
  });

  it("requires bearer authentication", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const response = await handleAgentMcp(rpcRequest("initialize"), env);
    const body = await response.json() as any;

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Unauthorized");
  });

  it("accepts authenticated notifications with an empty 202 response", async () => {
    const request = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    const response = await handleAgentMcp(request, env);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("advertises only the five run-focused tools", async () => {
    const response = await handleAgentMcp(rpcRequest("tools/list"), env);
    const body = await response.json() as any;

    expect(body.result.tools.map((tool: any) => tool.name)).toEqual([
      "list_templates",
      "start_run",
      "list_runs",
      "get_run",
      "update_run",
    ]);
    expect(JSON.stringify(body)).not.toContain("edit_template");

    const updateRun = body.result.tools.find((tool: any) => tool.name === "update_run");
    expect(updateRun.inputSchema.oneOf).toHaveLength(4);
    expect(updateRun.inputSchema.oneOf.map((branch: any) => ({
      operation: branch.properties.operation.const,
      required: branch.required,
    }))).toEqual([
      {
        operation: "set_task_completed",
        required: ["runId", "expectedRevision", "operation", "taskId", "completed"],
      },
      {
        operation: "set_subtask_completed",
        required: ["runId", "expectedRevision", "operation", "taskId", "subtaskId", "completed"],
      },
      {
        operation: "set_task_notes",
        required: ["runId", "expectedRevision", "operation", "taskId", "notes"],
      },
      {
        operation: "set_run_status",
        required: ["runId", "expectedRevision", "operation", "status"],
      },
    ]);
    expect(updateRun.inputSchema.oneOf.every((branch: any) => branch.additionalProperties === false)).toBe(true);
  });

  it("does not expose another user's or a team's templates", async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "owned",
        user_id: "user-1",
        owner_type: "user",
        team_id: null,
        deleted_at: null,
        title: "Owned",
        items: "[]",
      },
      {
        id: "other",
        user_id: "user-2",
        owner_type: "user",
        team_id: null,
        deleted_at: null,
        title: "Other",
        items: "[]",
      },
      {
        id: "team",
        user_id: "user-1",
        owner_type: "team",
        team_id: "team-1",
        deleted_at: null,
        title: "Team",
        items: "[]",
      },
    ]);

    const response = await handleAgentMcp(callTool("list_templates"), env);
    const body = await response.json() as any;

    expect(body.result.structuredContent.templates.map((template: any) => template.id)).toEqual(["owned"]);
  });

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

    const response = await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env);
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

    const response = await handleAgentMcp(callTool("update_run", {
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

    const response = await handleAgentMcp(callTool("update_run", {
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
  });

  it("does not write an audit event when the conditional revision update loses a race", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);
    dbMocks.updateChain.where.mockResolvedValueOnce({ meta: { changes: 0 } });

    const response = await handleAgentMcp(callTool("update_run", {
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
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("matches the checklist endpoint when reopening a completed run", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      status: "completed",
      progress: 67,
      revision: 2,
      completed_at: "2026-09-19T01:00:00.000Z",
      completed_by_user_id: "user-1",
    })]);

    const response = await handleAgentMcp(callTool("update_run", {
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

  it("hides a personal run owned by another user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("run_not_found");
  });
});
