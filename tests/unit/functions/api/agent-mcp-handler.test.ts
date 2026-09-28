import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn(), select: vi.fn() };
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
  markPersonalRunKeyUsed: vi.fn(),
}));

vi.mock("@functions/api/utils/entitlements", () => ({
  getEntitlementsForUser: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";

const identity = { keyId: "key-1", userId: "user-1", name: "Codex" };
const env = { DB: {} } as any;

function rpcRequest(method: string, params?: unknown, id: number | undefined = 1): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(method === "initialize" ? {} : { "MCP-Protocol-Version": "2025-06-18" }),
    },
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
    dbMocks.insertChain.select.mockReturnValue({ kind: "conditional-insert" });
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(identity);
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
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

  it("rejects non-POST methods before authentication", async () => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp"), env);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it.each([
    [{ "Content-Type": "text/plain", Accept: "application/json, text/event-stream" }, 415],
    [{ "Content-Type": "application/json", Accept: "application/json" }, 406],
    [{ "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Content-Length": "1048577" }, 413],
  ])("rejects invalid transport headers", async (extraHeaders, expectedStatus) => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer test", ...extraHeaders },
      body: "{}",
    }), env);
    expect(response.status).toBe(expectedStatus);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
  });

  it("rejects cross-origin browser requests and mismatched hosts", async () => {
    const disallowedOrigin = new Request("https://staging.serplists.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Origin: "https://evil.example",
      },
      body: "{}",
    });
    expect((await handleAgentMcp(disallowedOrigin, {
      ...env,
      FRONTEND_URL: "https://staging.serplists.com",
    })).status).toBe(403);

    const mismatchedHost = new Request("https://staging.serplists.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Host: "evil.example",
      },
      body: "{}",
    });
    expect((await handleAgentMcp(mismatchedHost, env)).status).toBe(403);
  });

  it("counter-offers the supported protocol version during initialization", async () => {
    const response = await handleAgentMcp(rpcRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }), env);
    const body = await response.json() as any;
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("rejects invalid request ids and incomplete initialize parameters", async () => {
    const validRequest = rpcRequest("ping");
    for (const invalidRequestId of [null, 1.5, { invalid: true }, false]) {
      const invalidId = await handleAgentMcp(new Request(validRequest.url, {
        method: "POST",
        headers: validRequest.headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: invalidRequestId, method: "ping" }),
      }), env);
      expect(await invalidId.json()).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      });
    }

    const malformedEnvelope = await handleAgentMcp(new Request(validRequest.url, {
      method: "POST",
      headers: validRequest.headers,
      body: JSON.stringify({ jsonrpc: "1.0", id: 1.5, method: "ping" }),
    }), env);
    expect(await malformedEnvelope.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });

    const incomplete = await handleAgentMcp(rpcRequest("initialize", {
      protocolVersion: "2025-06-18",
    }), env);
    expect((await incomplete.json() as any).error.code).toBe(-32602);
  });

  it("requires the negotiated protocol header after initialization", async () => {
    const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }), env);
    const body = await response.json() as any;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toContain("MCP-Protocol-Version");
  });

  it("returns safe JSON-RPC errors for malformed and unexpected requests", async () => {
    const malformed = rpcRequest("ping");
    const malformedResponse = await handleAgentMcp(new Request(malformed.url, {
      method: "POST",
      headers: malformed.headers,
      body: "{broken",
    }), env);
    expect((await malformedResponse.json() as any).error.code).toBe(-32700);

    dbMocks.selectChain.orderBy.mockRejectedValueOnce(new Error("sensitive database detail"));
    const failed = await handleAgentMcp(callTool("list_templates"), env);
    const body = await failed.json() as any;
    expect(body.error).toEqual({ code: -32603, message: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });

  it("accepts authenticated notifications with an empty 202 response", async () => {
    const request = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
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
    expect(body.result.tools.map((tool: any) => tool.annotations)).toEqual([
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    ]);
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
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
    expect(body.result.structuredContent.templates[0]).not.toHaveProperty("sections");
    expect(body.result.content[0].text).toContain('"id":"owned"');
    expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, identity);
  });

  it("returns protocol errors for unknown tools and invalid tool arguments", async () => {
    const unknownResponse = await handleAgentMcp(callTool("not_a_tool"), env);
    const unknown = await unknownResponse.json() as any;
    expect(unknown.error).toEqual({
      code: -32602,
      message: "Unknown tool: not_a_tool",
      data: { code: "tool_not_found" },
    });

    const invalidResponse = await handleAgentMcp(callTool("get_run", {}), env);
    const invalid = await invalidResponse.json() as any;
    expect(invalid.error.code).toBe(-32602);
    expect(invalid.error.data.code).toBe("invalid_arguments");
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
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("does not write an audit event when the conditional revision update loses a race", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

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

  it("rejects an impossible atomic batch result as an internal invariant", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

    const response = await handleAgentMcp(callTool("update_run", {
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

    const response = await handleAgentMcp(callTool("update_run", {
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

  it("bounds oversized structured tool results", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      items: JSON.stringify([{ id: "section-1", items: [{ id: "task-1", notes: "x".repeat(600_000) }] }]),
    })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("result_too_large");
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("applies a process-local request limit per key", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...identity, keyId: "rate-limited-key" });
    for (let index = 0; index < 120; index += 1) {
      const response = await handleAgentMcp(rpcRequest("ping", undefined, index + 1), env);
      expect(response.status).toBe(200);
    }
    const limited = await handleAgentMcp(rpcRequest("ping", undefined, 999), env);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("returns retired work from get_run but keeps list_runs small", async () => {
    const retired = [
      { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "Check DNS", isCompleted: true, notes: "TTL lowered" } },
    ];
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);

    const getResponse = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const getBody = await getResponse.json() as any;
    expect(getBody.result.structuredContent.run.retiredItems).toEqual(retired);

    dbMocks.selectChain.orderBy.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);
    const listResponse = await handleAgentMcp(callTool("list_runs"), env);
    const listBody = await listResponse.json() as any;
    expect(listBody.result.structuredContent.runs[0]).not.toHaveProperty("retiredItems");
    expect(listBody.result.structuredContent.runs[0]).not.toHaveProperty("sections");
  });

  it("hides a personal run owned by another user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("run_not_found");
  });
});
