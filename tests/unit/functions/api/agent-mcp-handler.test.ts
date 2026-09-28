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
import { updateRunArgs } from "@functions/api/handlers/agentMcpTools";
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

const RESULT_LIMIT_BYTES = 512 * 1024;

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

// Sections whose serialized size is at least `targetBytes`: the standard task-1 (with
// subtasks sub-1/sub-2) followed by filler tasks carrying long ASCII notes.
function largeSections(targetBytes: number, fillerNotes = 10_000): JsonRecord[] {
  const task1 = {
    id: "task-1",
    title: "Verify",
    isCompleted: false,
    notes: "",
    contents: [{
      type: "subItems",
      subItems: [
        { id: "sub-1", title: "Tests pass", isCompleted: false },
        { id: "sub-2", title: "Preview checked", isCompleted: false },
      ],
    }],
  };
  const items: JsonRecord[] = [task1];
  const sections = [{ id: "section-1", title: "Release", items }];
  let index = 0;
  while (byteLength(sections) < targetBytes) {
    items.push({ id: `filler-${index}`, title: `Filler ${index}`, isCompleted: false, notes: "x".repeat(fillerNotes) });
    index += 1;
  }
  return sections;
}

function ownedTemplate(items: unknown[]): JsonRecord {
  return {
    id: "template-1",
    user_id: "user-1",
    owner_type: "user",
    team_id: null,
    deleted_at: null,
    title: "Release SOP",
    items: JSON.stringify(items),
    content_version: 1,
  };
}

async function toolBody(response: Response): Promise<any> {
  return response.json();
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
    expect(updateRun.inputSchema.required).toEqual(["runId", "expectedRevision", "operation"]);
    expect(updateRun.inputSchema.properties.operation.enum).toEqual([
      "set_task_completed",
      "set_subtask_completed",
      "set_task_notes",
      "set_run_status",
    ]);
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

  describe("tool input schemas", () => {
    // Model APIs reject tool schemas with a combinator at the root (the Messages API
    // returns 400 for the whole request), and bridges that build function signatures
    // read only top-level properties.
    const ROOT_KEYWORDS_CLIENTS_REJECT = ["oneOf", "anyOf", "allOf", "not", "if", "then", "else", "$ref", "enum", "const"];

    async function listTools(): Promise<any[]> {
      return (await toolBody(await handleAgentMcp(rpcRequest("tools/list"), env))).result.tools;
    }

    // The checks a client makes against the advertised schema: known keys, types, enums, required.
    function advertisedSchemaProblems(schema: any, args: JsonRecord): string[] {
      const problems = (schema.required ?? []).filter((name: string) => !(name in args))
        .map((name: string) => `missing ${name}`);
      for (const [name, value] of Object.entries(args)) {
        const property = schema.properties[name];
        if (!property) {
          problems.push(`unknown ${name}`);
          continue;
        }
        const typeMatches = property.type === "integer" ? Number.isInteger(value) : typeof value === property.type;
        if (!typeMatches) problems.push(`type ${name}`);
        if (property.enum && !property.enum.includes(value)) problems.push(`enum ${name}`);
      }
      return problems;
    }

    it("advertises a plain object schema with top-level properties for every tool", async () => {
      for (const tool of await listTools()) {
        const schema = tool.inputSchema;
        expect(schema.type, tool.name).toBe("object");
        expect(typeof schema.properties, tool.name).toBe("object");
        expect(Array.isArray(schema.properties), tool.name).toBe(false);
        expect(schema.additionalProperties, tool.name).toBe(false);
        for (const keyword of ROOT_KEYWORDS_CLIENTS_REJECT) expect(schema, `${tool.name}.${keyword}`).not.toHaveProperty(keyword);
        for (const name of schema.required ?? []) expect(schema.properties, `${tool.name}.${name}`).toHaveProperty(name);
      }
    });

    it("keeps the advertised update_run schema in step with its validator", async () => {
      const updateRun = (await listTools()).find((tool) => tool.name === "update_run");
      const operations = updateRunArgs.options.map((option) => option.shape.operation.value);
      expect(updateRun.inputSchema.properties.operation.enum).toEqual(operations);
      for (const option of updateRunArgs.options) {
        for (const key of Object.keys(option.shape)) expect(updateRun.inputSchema.properties).toHaveProperty(key);
      }
      for (const operation of operations) expect(updateRun.description).toContain(operation);
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: true }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: true }],
      ["set_task_notes", { taskId: "task-1", notes: "Checked" }],
      ["set_run_status", { status: "completed" }],
    ])("accepts %s arguments that match the advertised schema, with unused fields sent as null", async (operation, fields) => {
      const updateRun = (await listTools()).find((tool) => tool.name === "update_run");
      const args = { runId: "run-1", expectedRevision: 1, operation, ...fields };
      expect(advertisedSchemaProblems(updateRun.inputSchema, args)).toEqual([]);

      const unused = Object.fromEntries(["taskId", "subtaskId", "completed", "notes", "status"]
        .filter((name) => !(name in fields))
        .map((name) => [name, null]));
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun()]);
      const body = await toolBody(await handleAgentMcp(callTool("update_run", { ...args, ...unused }), env));

      expect(body.error).toBeUndefined();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.run.revision).toBe(2);
    });

    it("names the offending field when update_run arguments do not fit the operation", async () => {
      const missing = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
      }), env));
      expect(missing.error.code).toBe(-32602);
      expect(missing.error.message).toContain("notes");

      const extra = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_completed",
        taskId: "task-1",
        completed: true,
        notes: "Not for this operation",
      }), env));
      expect(extra.error.code).toBe(-32602);
      expect(extra.error.message).toContain("notes");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });
  });

  describe("run size bounds", () => {
    it("rejects start_run on an oversized template before writing anything", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(largeSections(600 * 1024))]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent.error).toBe("content_too_large");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("rejects set_task_notes that pushes a run past the content cap without writing", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(largeSections(370 * 1024)),
      })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "n".repeat(20_000),
      }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent.error).toBe("content_too_large");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("counts notes by UTF-8 bytes, not characters", async () => {
      // About 340 KB of ASCII plus 20,000 three-byte characters: under the cap in
      // characters, over it in bytes.
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(largeSections(340 * 1024)),
      })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "界".repeat(20_000),
      }), env));

      expect(body.result.structuredContent.error).toBe("content_too_large");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: true }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: true }],
      ["set_task_notes", { taskId: "filler-0", notes: "" }],
      ["set_run_status", { status: "completed" }],
    ])("never reports a committed %s on an oversized run as a failure", async (operation, fields) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(largeSections(600 * 1024)),
        revision: 7,
      })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 7,
        operation,
        ...fields,
      }), env));

      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.run).toEqual(expect.objectContaining({ id: "run-1", revision: 8 }));
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(RESULT_LIMIT_BYTES);
      expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, identity);
    });

    it("returns every committed mutation within the result bound", async () => {
      const tools = (await toolBody(await handleAgentMcp(rpcRequest("tools/list"), env))).result.tools;
      const mutatingTools = tools.filter((tool: any) => tool.annotations.readOnlyHint === false)
        .map((tool: any) => tool.name);
      expect(mutatingTools).toEqual(["start_run", "update_run"]);

      const calls: Record<string, () => Promise<Response>> = {
        start_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(largeSections(370 * 1024))]);
          return handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env);
        },
        update_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
            items: JSON.stringify(largeSections(370 * 1024)),
          })]);
          return handleAgentMcp(callTool("update_run", {
            runId: "run-1",
            expectedRevision: 1,
            operation: "set_task_completed",
            taskId: "task-1",
            completed: true,
          }), env);
        },
      };

      for (const name of mutatingTools) {
        vi.mocked(markPersonalRunKeyUsed).mockClear();
        dbMocks.db.batch.mockClear();
        const body = await toolBody(await calls[name]());
        expect(dbMocks.db.batch).toHaveBeenCalledOnce();
        expect(body.result.isError).toBeUndefined();
        expect(body.result.structuredContent.run).toEqual(expect.objectContaining({
          id: expect.any(String),
          revision: expect.any(Number),
        }));
        expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(RESULT_LIMIT_BYTES);
        expect(markPersonalRunKeyUsed).toHaveBeenCalledOnce();
      }
    });

    it("returns the changed task and a compact run summary from update_run", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      }), env));

      expect(body.result.structuredContent.run).not.toHaveProperty("sections");
      expect(body.result.structuredContent.run).toEqual(expect.objectContaining({ id: "run-1", revision: 3 }));
      expect(body.result.structuredContent.task).toEqual(expect.objectContaining({ id: "task-1", notes: "Evidence" }));
    });

    it("reads one task or section of a run too large to return at once", async () => {
      const oversized = personalRun({ items: JSON.stringify(largeSections(600 * 1024)) });

      dbMocks.selectChain.limit.mockResolvedValueOnce([oversized]);
      const whole = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env));
      expect(whole.result.isError).toBe(true);
      expect(whole.result.structuredContent.error).toBe("result_too_large");
      expect(whole.result.structuredContent.message).toContain("taskId");
      expect(whole.result.structuredContent.details.run).toEqual(expect.objectContaining({ id: "run-1", revision: 1 }));
      expect(whole.result.structuredContent.details.sections[0]).toEqual(expect.objectContaining({
        id: "section-1",
        tasks: expect.arrayContaining([{ id: "task-1", title: "Verify" }]),
      }));
      expect(byteLength(whole.result.structuredContent)).toBeLessThanOrEqual(RESULT_LIMIT_BYTES);

      dbMocks.selectChain.limit.mockResolvedValueOnce([oversized]);
      const task = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", taskId: "task-1" }), env));
      expect(task.result.isError).toBeUndefined();
      expect(task.result.structuredContent.run.sections).toEqual([
        expect.objectContaining({ id: "section-1", items: [expect.objectContaining({ id: "task-1" })] }),
      ]);
      expect(task.result.structuredContent.run.revision).toBe(1);

      dbMocks.selectChain.limit.mockResolvedValueOnce([oversized]);
      const missing = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", taskId: "nope" }), env));
      expect(missing.result.structuredContent.error).toBe("task_not_found");

      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun()]);
      const section = await toolBody(await handleAgentMcp(callTool("get_run", {
        runId: "run-1",
        sectionId: "section-1",
      }), env));
      expect(section.result.structuredContent.run.sections.map((entry: any) => entry.id)).toEqual(["section-1"]);
    });
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

  it("hides a personal run owned by another user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("run_not_found");
  });
});
