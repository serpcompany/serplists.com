import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Pass through, but record what each tool writes to audit_events.
vi.mock("@functions/api/utils/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@functions/api/utils/audit")>();
  return { ...actual, buildAuditEventValues: vi.fn(actual.buildAuditEventValues) };
});

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { runView } from "@functions/api/handlers/agentMcpRunPages";
import { MAX_TASK_NOTES_BYTES, MAX_TASK_NOTES_LENGTH, updateRunArgs } from "@functions/api/handlers/agentMcpTools";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey } from "@functions/api/utils/personal-run-key";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES, TEMPLATE_CONTENT_MAX_BYTES } from "@/lib/schemas/contentLimits";
import {
  LEGACY_ID_RUN_SECTIONS,
  LEGACY_ID_TEMPLATE_SECTIONS,
  TICKED_TEMPLATE_SECTIONS,
  UNTICKED_RUN_SECTIONS,
} from "../../../fixtures/runStartFixtures";
import { readRunInFull } from "../../../support/runPages";

const identity = {
  keyId: "key-1",
  userId: "user-1",
  name: "Codex",
  permissions: ["templates:read", "templates:write", "runs:read", "runs:write"] as const,
};
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

// Every task and Sub-task ticked: set_run_status completed refuses a run with work left.
function tickEverything(sections: JsonRecord[]): JsonRecord[] {
  const tick = (record: JsonRecord) => ({ ...record, isCompleted: true });
  return sections.map((section) => ({
    ...section,
    items: (section.items as JsonRecord[]).map((item) => ({
      ...tick(item),
      ...(Array.isArray(item.contents)
        ? { contents: item.contents.map((content: JsonRecord) => ({ ...content, subItems: (content.subItems as JsonRecord[]).map(tick) })) }
        : {}),
    })),
  }));
}

const finishedRun = (overrides: JsonRecord = {}) =>
  personalRun({ items: JSON.stringify(tickEverything(JSON.parse(personalRun().items as string))), ...overrides });

const finishedFor = (operation: string, sections: JsonRecord[]) =>
  operation === "set_run_status" ? tickEverything(sections) : sections;

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
    // clearAllMocks keeps queued mockResolvedValueOnce values; drop them so one test's
    // unused rows cannot leak into the next.
    dbMocks.selectChain.limit.mockReset();
    dbMocks.db.batch.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
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

    dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("sensitive database detail"));
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

  it("advertises personal template and run tools without delete or publish controls", async () => {
    const response = await handleAgentMcp(rpcRequest("tools/list"), env);
    const body = await response.json() as any;

    expect(body.result.tools.map((tool: any) => tool.name)).toEqual([
      "list_templates",
      "get_template",
      "create_template",
      "update_template",
      "start_run",
      "list_runs",
      "get_run",
      "update_run",
    ]);
    const serialized = JSON.stringify(body);
    for (const forbidden of ["delete", "is_public", "visibility", "teamId", "slug"]) {
      expect(serialized).not.toContain(forbidden);
    }

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
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    ]);
    expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
  });

  it("lists never-edited templates by when they were created, not after every edited one", async () => {
    await handleAgentMcp(callTool("list_templates"), env);
    const orderBy = dbMocks.selectChain.orderBy.mock.calls[0].map((part: unknown) =>
      new SQLiteSyncDialect().sqlToQuery(part as SQL));

    // Run the handler's ORDER BY on real SQLite, which sorts NULL below every value.
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec('create table "templates" ("id" text, "created_at" text, "updated_at" text)');
    const insert = sqlite.prepare('insert into "templates" values (?, ?, ?)');
    insert.run("edited-long-ago", "2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");
    insert.run("edited-recently", "2024-01-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    insert.run("created-today", "2026-09-20T00:00:00.000Z", null);
    insert.run("imported-a", "2025-05-05T00:00:00.000Z", null);
    insert.run("imported-b", "2025-05-05T00:00:00.000Z", null);
    const ordered = sqlite
      .prepare(`select "id" from "templates" order by ${orderBy.map((part: { sql: string }) => part.sql).join(", ")}`)
      .all(...orderBy.flatMap((part: { params: unknown[] }) => part.params as string[]))
      .map((row) => row.id);
    sqlite.close();

    expect(ordered).toEqual(["created-today", "edited-recently", "imported-b", "imported-a", "edited-long-ago"]);
  });

  it("offers and allows only the tools a key's permissions cover", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...identity, permissions: ["runs:read"] });

    const listResponse = await handleAgentMcp(rpcRequest("tools/list"), env);
    const list = await listResponse.json() as any;
    expect(list.result.tools.map((tool: any) => tool.name)).toEqual(["list_runs", "get_run"]);

    const deniedResponse = await handleAgentMcp(callTool("create_template", {
      title: "Denied",
      sections: [{ title: "Section", items: [{ title: "Task" }] }],
    }), env);
    const denied = await deniedResponse.json() as any;
    expect(denied.result.isError).toBe(true);
    expect(denied.result.structuredContent).toMatchObject({
      error: "permission_denied",
      details: { permission: "templates:write" },
    });
    expect(dbMocks.db.select).not.toHaveBeenCalled();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("does not expose another user's or a team's templates", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
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

  it.each([
    ["", TICKED_TEMPLATE_SECTIONS, UNTICKED_RUN_SECTIONS],
    [" and the ids its Template's next save stores", LEGACY_ID_TEMPLATE_SECTIONS, LEGACY_ID_RUN_SECTIONS],
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

    const response = await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    // Same fixture and expectation as the web create test in checklists-handler.test.ts.
    expect(JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items)).toEqual(runSections);
  });

  describe("template tools", () => {
    const ids = (sections: any[]) => sections.map((section) => [section.id, section.items.map((item: any) => item.id)]);

    it("reads a template stored without ids with the ids its runs and next save use", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(LEGACY_ID_TEMPLATE_SECTIONS)]);
      const read = await toolBody(await handleAgentMcp(callTool("get_template", { templateId: "template-1" }), env));

      expect(read.result.isError).toBeUndefined();
      // Sending these back in update_template keeps every id, so runs keep their progress.
      expect(ids(read.result.structuredContent.template.sections)).toEqual(ids(LEGACY_ID_RUN_SECTIONS));
    });

    it("treats null optional fields as absent, as every other tool does", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([]) // the slug is free
        .mockResolvedValueOnce([{ ...ownedTemplate(JSON.parse(personalRun().items as string)), version: 1 }]);

      const body = await toolBody(await handleAgentMcp(callTool("create_template", {
        title: "Release SOP",
        description: null,
        categories: null,
        tags: null,
        sections: [{ title: "Release", items: [{ title: "Verify" }] }],
      }), env));

      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.template).toEqual(expect.objectContaining({ id: "template-1", version: 1 }));
      const created = dbMocks.insertChain.values.mock.calls.map(([values]) => values)
        .find((values: JsonRecord) => values.owner_type === "user" && typeof values.slug === "string");
      expect(created).toEqual(expect.objectContaining({ is_public: false, team_id: null, user_id: "user-1" }));
    });

    it("names the offending field when template arguments are invalid", async () => {
      const body = await toolBody(await handleAgentMcp(callTool("update_template", {
        templateId: "template-1",
        expectedVersion: 1,
        title: "",
      }), env));

      expect(body.error.data.code).toBe("invalid_arguments");
      expect(body.error.message).toMatch(/^title: /);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("reports a committed create as success when reading it back fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        dbMocks.selectChain.limit
          .mockResolvedValueOnce([]) // the slug is free
          .mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

        const body = await toolBody(await handleAgentMcp(callTool("create_template", {
          title: "Release SOP",
          sections: [{ title: "Release", items: [{ title: "Verify" }] }],
        }), env));

        // A retried create would make a duplicate, so the committed write is never an error.
        expect(dbMocks.db.batch).toHaveBeenCalledOnce();
        expect(body.result.isError).toBeUndefined();
        expect(body.result.structuredContent).toEqual({
          template: { id: expect.any(String), title: "Release SOP", version: 1 },
          sectionsOmitted: true,
        });
        expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)).message)).toContain("mcp_template_reload_error");
      } finally {
        warn.mockRestore();
      }
    });

    it("records the Run Key on the template's history", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...ownedTemplate([]), version: 1 }]);

      await handleAgentMcp(callTool("create_template", {
        title: "Release SOP",
        sections: [{ title: "Release", items: [{ title: "Verify" }] }],
      }), env);

      expect(dbMocks.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
        action: "template.created",
        metadata_json: expect.stringContaining('"personalRunKeyName":"Codex"'),
      }));
    });
  });

  describe("Free plan active run limit", () => {
    const freePlan = { plan: "free", limits: { maxTemplates: 1, maxActiveRuns: 3 } } as const;
    const renderSql = (query: unknown) => new SQLiteSyncDialect().sqlToQuery(query as SQL);

    beforeEach(() => {
      vi.mocked(getEntitlementsForUser).mockResolvedValue(freePlan as any);
    });

    it("rejects start_run when a concurrent start filled the limit after the pre-check", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([ownedTemplate(largeSections(1))])
        .mockResolvedValueOnce([{ count: 2 }]) // pre-check: one slot left
        .mockResolvedValueOnce([{ count: 3 }]); // re-count after the guarded insert is refused
      dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toEqual(expect.objectContaining({
        error: "limit_reached",
        details: { limit: 3, current: 3 },
      }));
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("inserts the run and its audit event only while the owner is under the limit", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([ownedTemplate(largeSections(1))])
        .mockResolvedValueOnce([{ count: 2 }]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

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
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(largeSections(1))]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.insertChain.select).not.toHaveBeenCalled();
      expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([{ kind: "insert" }, { kind: "insert" }]);
    });
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

  it("keeps the original completion stamps when a completed run is marked completed again", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      status: "completed",
      progress: 100,
      revision: 2,
      completed_at: "2026-09-19T01:00:00.000Z",
      completed_by_user_id: "user-1",
    })]);

    const response = await handleAgentMcp(callTool("update_run", {
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

    const response = await handleAgentMcp(callTool("update_run", {
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

  // The run page completes a run only once every task and Sub-task is done, and then freezes
  // it, so an agent may not leave a run Completed with open work the page cannot reopen.
  describe("completing a run with work left", () => {
    const completeRun = (run: JsonRecord) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      return handleAgentMcp(callTool("update_run", {
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

    const response = await handleAgentMcp(callTool("update_run", {
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

    const response = await handleAgentMcp(callTool("update_run", {
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

  it("returns a run too large for one result as its outline, within the bound", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      items: JSON.stringify([{ id: "section-1", title: "Release", items: [{ id: "task-1", notes: "x".repeat(600_000) }] }]),
    })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toMatchObject({
      run: { id: "run-1", revision: 1, sectionCount: 1, taskCount: 1, retiredCount: 0 },
      sectionsOmitted: true,
      outline: [{ id: "section-1", title: "Release", taskCount: 1 }],
      limit: MAX_RESULT_BYTES,
    });
    expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(body.result.content[0].text).toMatch(/^Run "Release SOP" is too large to return at once, so this is its outline/);
    expect(markPersonalRunKeyUsed).toHaveBeenCalled();
  });

  describe("audit payloads", () => {
    const AUDIT_PAYLOAD_BUDGET_BYTES = 4 * 1024;

    async function recordedAudit() {
      expect(buildAuditEventValues).toHaveBeenCalledOnce();
      return vi.mocked(buildAuditEventValues).mock.results[0].value as ReturnType<typeof buildAuditEventValues>;
    }

    function expectCompact(payload: string | null | undefined) {
      if (payload == null) return;
      expect(payload).not.toMatch(/"items"|retired_items|share_token/);
      expect(new TextEncoder().encode(payload).byteLength).toBeLessThan(AUDIT_PAYLOAD_BUDGET_BYTES);
    }

    it("records a run summary, not its content, when start_run creates a run", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(largeSections(200 * 1024))]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));
      const audit = await recordedAudit();

      expect(body.result.isError).toBeUndefined();
      expectCompact(audit.after_json);
      expect(JSON.parse(audit.after_json ?? "{}")).toEqual(expect.objectContaining({
        id: body.result.structuredContent.run.id,
        status: "in_progress",
        revision: 1,
      }));
      expect(audit.metadata_json).toContain('"personalRunKeyName":"Codex"');
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: true }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: true }],
      ["set_task_notes", { taskId: "task-1", notes: "n".repeat(20_000) }],
      ["set_run_status", { status: "completed" }],
    ])("records a compact %s change instead of copies of the run", async (operation, fields) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(finishedFor(operation, largeSections(200 * 1024))),
        retired_items: JSON.stringify(largeSections(20 * 1024)),
        revision: 4,
      })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 4,
        operation,
        ...fields,
      }), env));
      const audit = await recordedAudit();

      expect(body.result.isError).toBeUndefined();
      for (const payload of [audit.before_json, audit.after_json, audit.diff_json]) expectCompact(payload);
      const diff = JSON.parse(audit.diff_json ?? "{}");
      expect(diff).toEqual(expect.objectContaining({ operation, revision: { from: 4, to: 5 } }));
      expect(diff.progress).toEqual({ from: 0, to: expect.any(Number) });
      if ("taskId" in fields) expect(diff.taskId).toBe("task-1");
      if (operation === "set_task_notes") {
        expect(diff).toEqual(expect.objectContaining({ notesLength: 20_000 }));
        expect(audit.diff_json).not.toContain("nnnn");
      }
      expect(JSON.parse(audit.before_json ?? "{}")).toEqual(expect.objectContaining({ revision: 4 }));
      expect(JSON.parse(audit.after_json ?? "{}")).toEqual(expect.objectContaining({ revision: 5 }));
    });

    it("does not rewrite run content for a status-only change", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([finishedRun({ progress: 40 })]);

      await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_run_status",
        status: "completed",
      }), env);

      const updates = dbMocks.updateChain.set.mock.calls[0][0];
      expect(updates).not.toHaveProperty("items");
      expect(updates).toEqual(expect.objectContaining({ status: "completed", progress: 40, revision: 2 }));
      const diff = JSON.parse((await recordedAudit()).diff_json ?? "{}");
      expect(diff).toEqual(expect.objectContaining({ status: "completed", progress: { from: 40, to: 40 } }));
    });
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
      dbMocks.selectChain.limit.mockResolvedValueOnce([operation === "set_run_status" ? finishedRun() : personalRun()]);
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
    // A new run drops template notes (run-only state), so a template is padded with descriptions.
    const templateSections = (targetBytes: number) => largeSections(targetBytes).map((section) => ({
      ...section,
      items: (section.items as JsonRecord[]).map(({ notes, ...task }) => ({ ...task, description: notes })),
    }));

    it("rejects start_run on a template whose run would be too large to save, before writing anything", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(templateSections(RUN_CONTENT_MAX_BYTES + 32 * 1024))]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toMatchObject({ error: "content_too_large", details: { limit: RUN_CONTENT_MAX_BYTES } });
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("starts a run from a template at the template limit and returns its fields without sections", async () => {
      const sections = templateSections(TEMPLATE_CONTENT_MAX_BYTES - 24 * 1024);
      expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(sections)]);

      const body = await toolBody(await handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent).toEqual({
        run: expect.objectContaining({ templateId: "template-1", title: "Release SOP", revision: 1, progress: 0 }),
        sectionsOmitted: true,
      });
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(body.result.content[0].text).toBe(
        `Started run "Release SOP". It is too large for one result; read it with get_run.\n\n${toJson(body.result.structuredContent)}`,
      );
    });

    it("rejects set_task_notes that pushes a run past the content limit without writing", async () => {
      const sections = largeSections(RUN_CONTENT_MAX_BYTES - 24 * 1024);
      expect(contentSaveBytes(sections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
      expect(contentSaveBytes(sections) + 20_000).toBeGreaterThan(RUN_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify(sections) })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "n".repeat(20_000),
      }), env));

      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent).toMatchObject({ error: "content_too_large", details: { limit: RUN_CONTENT_MAX_BYTES } });
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("counts notes by UTF-8 bytes, not characters", async () => {
      // Room for 20,000 characters of ASCII, but not for 10,000 three-byte characters (30,000
      // bytes, within the notes limit).
      const sections = largeSections(RUN_CONTENT_MAX_BYTES - 32 * 1024);
      const room = RUN_CONTENT_MAX_BYTES - contentSaveBytes(sections);
      expect(room).toBeGreaterThan(20_000);
      expect(room).toBeLessThan(30_000);
      const setNotes = (notes: string) => {
        dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify(sections) })]);
        return handleAgentMcp(callTool("update_run", {
          runId: "run-1",
          expectedRevision: 1,
          operation: "set_task_notes",
          taskId: "task-1",
          notes,
        }), env).then(toolBody);
      };

      expect((await setNotes("界".repeat(10_000))).result.structuredContent.error).toBe("content_too_large");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect((await setNotes("n".repeat(20_000))).result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: true }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: true }],
      ["set_task_notes", { taskId: "filler-0", notes: "" }],
      ["set_run_status", { status: "completed" }],
    ])("never reports a committed %s on a run over the content limit as a failure", async (operation, fields) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(finishedFor(operation, largeSections(RUN_CONTENT_MAX_BYTES + 64 * 1024))),
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
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, identity);
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: false }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: false }],
    ])("allows unchecking with %s on a run already over the content limit", async (operation, fields) => {
      // "isCompleted":false is one byte longer than "isCompleted":true, so unchecking grows the
      // stored run slightly; the limit counts every task as unticked, so it must still commit.
      const sections = largeSections(RUN_CONTENT_MAX_BYTES + 64 * 1024);
      const task1 = (sections[0].items as JsonRecord[])[0];
      task1.isCompleted = true;
      for (const subtask of (task1.contents as JsonRecord[])[0].subItems as JsonRecord[]) subtask.isCompleted = true;
      expect(contentSaveBytes(sections)).toBeGreaterThan(RUN_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(sections),
        progress: 1,
        revision: 7,
      })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 7,
        operation,
        ...fields,
      }), env));

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent.run).toEqual(expect.objectContaining({ id: "run-1", revision: 8 }));
      expect(body.result.structuredContent.task).toEqual(expect.objectContaining({ id: "task-1", isCompleted: false }));
      expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, identity);
    });

    it("returns every committed mutation within the result bound", async () => {
      const tools = (await toolBody(await handleAgentMcp(rpcRequest("tools/list"), env))).result.tools;
      const mutatingTools = tools.filter((tool: any) => tool.annotations.readOnlyHint === false)
        .map((tool: any) => tool.name);
      expect(mutatingTools).toEqual(["create_template", "update_template", "start_run", "update_run"]);

      // A template the write stored, read back too large to return whole.
      const storedTemplate = { ...ownedTemplate(largeSections(600 * 1024)), version: 2, is_public: false, slug: "release-sop" };
      const calls: Record<string, () => Promise<Response>> = {
        create_template: () => {
          dbMocks.selectChain.limit
            .mockResolvedValueOnce([]) // the slug is free
            .mockResolvedValueOnce([storedTemplate]);
          return handleAgentMcp(callTool("create_template", {
            title: "Release SOP",
            sections: [{ title: "Release", items: [{ title: "Verify" }] }],
          }), env);
        },
        update_template: () => {
          dbMocks.selectChain.limit
            .mockResolvedValueOnce([{ ...storedTemplate, version: 1 }])
            .mockResolvedValueOnce([storedTemplate]);
          dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
          return handleAgentMcp(callTool("update_template", {
            templateId: "template-1",
            expectedVersion: 1,
            title: "Release SOP v2",
          }), env);
        },
        start_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(templateSections(TEMPLATE_CONTENT_MAX_BYTES - 24 * 1024))]);
          return handleAgentMcp(callTool("start_run", { templateId: "template-1" }), env);
        },
        update_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
            items: JSON.stringify(largeSections(RUN_CONTENT_MAX_BYTES - 24 * 1024)),
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
        expect(dbMocks.db.batch, name).toHaveBeenCalledOnce();
        expect(body.result.isError, name).toBeUndefined();
        const { structuredContent } = body.result;
        if (name.endsWith("_template")) {
          expect(structuredContent.template).toEqual(expect.objectContaining({ id: expect.any(String), version: 2 }));
          expect(structuredContent.sectionsOmitted).toBe(true);
        } else {
          expect(structuredContent.run).toEqual(expect.objectContaining({
            id: expect.any(String),
            revision: expect.any(Number),
          }));
        }
        expect(byteLength(structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
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
      expect(body.result.structuredContent).toEqual({
        run: expect.objectContaining({ id: "run-1", revision: 3 }),
        sectionId: "section-1",
        taskId: "task-1",
        task: expect.objectContaining({ id: "task-1", notes: "Evidence" }),
      });
    });

    it("names a changed task too large for one result instead of returning it", async () => {
      // Short notes on a task whose own content, from its template, is too large for one result.
      const [section] = JSON.parse(personalRun().items as string);
      section.items[0].contents.unshift({ id: "guide", type: "text", value: "Read the runbook first. ".repeat(1_500) });
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify([section]), revision: 2 })]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      }), env));

      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent).toEqual({
        run: expect.objectContaining({ id: "run-1", revision: 3 }),
        sectionId: "section-1",
        taskId: "task-1",
        taskOmitted: true,
      });
      expect(body.result.content[0].text)
        .toMatch(/^Updated run "Release SOP"\. The task is too large for one result; read it with get_run and taskId\./);
    });

    it("reads a run too large for one result a section, a page of tasks, or a task at a time", async () => {
      const oversized = personalRun({ items: JSON.stringify(largeSections(600 * 1024)) });
      const read = async (args: JsonRecord) => {
        dbMocks.selectChain.limit.mockResolvedValueOnce([oversized]);
        const body = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", ...args }), env));
        expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
        return body.result;
      };

      const task = await read({ taskId: "task-1" });
      expect(task.isError).toBeUndefined();
      expect(task.structuredContent).toEqual({
        run: { id: "run-1", revision: 1 },
        sectionId: "section-1",
        task: expect.objectContaining({ id: "task-1", title: "Verify" }),
      });

      const firstPage = await read({ sectionId: "section-1" });
      expect(firstPage.structuredContent.section).toMatchObject({ id: "section-1", taskCount: expect.any(Number), firstTask: 0 });
      const nextPage = await read({ cursor: firstPage.structuredContent.nextCursor });
      expect(nextPage.structuredContent.section.firstTask).toBe(firstPage.structuredContent.section.items.length);
      expect(nextPage.content[0].text).toMatch(/^Loaded tasks \d+-\d+ of the \d+ in a section too large for one result\./);

      expect((await read({ taskId: "nope" })).structuredContent.error).toBe("task_not_found");

      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun()]);
      const section = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", sectionId: "section-1" }), env));
      expect(section.result.structuredContent).toEqual({
        run: { id: "run-1", revision: 1 },
        section: expect.objectContaining({ id: "section-1", title: "Release" }),
      });
    });
  });

  describe("the notes update_run writes", () => {
    const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

    const setNotes = async (notes: string, run = personalRun()) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      return toolBody(await handleAgentMcp(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes,
      }), env));
    };

    it("keeps the limits in the advertised schema", async () => {
      expect(MAX_TASK_NOTES_BYTES).toBe(30 * 1024);
      const tools = (await toolBody(await handleAgentMcp(rpcRequest("tools/list"), env))).result.tools;
      const updateRun = tools.find((tool: any) => tool.name === "update_run");
      expect(updateRun.inputSchema.properties.notes).toMatchObject({ type: "string", maxLength: MAX_TASK_NOTES_LENGTH });
      for (const text of [updateRun.description, updateRun.inputSchema.properties.notes.description]) {
        expect(text).toContain("at most 20,000 characters and 30KB (30,720 bytes of UTF-8)");
      }
    });

    it.each([
      ["20,000 characters of ASCII", "n".repeat(MAX_TASK_NOTES_LENGTH)],
      ["30KB of three-byte text", "界".repeat(MAX_TASK_NOTES_BYTES / 3)],
      ["30KB of emoji (four bytes and two characters each)", "🚀".repeat(MAX_TASK_NOTES_BYTES / 4)],
    ])("writes %s and returns it in one result, as get_run reads it back", async (_notes, notes) => {
      expect(notes.length).toBeLessThanOrEqual(MAX_TASK_NOTES_LENGTH);
      expect(utf8Bytes(notes)).toBeLessThanOrEqual(MAX_TASK_NOTES_BYTES);

      const written = await setNotes(notes);
      expect(written.result.isError).toBeUndefined();
      expect(written.result.structuredContent).toEqual({
        run: expect.objectContaining({ id: "run-1", revision: 2 }),
        sectionId: "section-1",
        taskId: "task-1",
        task: expect.objectContaining({ id: "task-1", notes }),
      });

      const stored = dbMocks.updateChain.set.mock.calls[0][0].items as string;
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: stored, revision: 2 })]);
      const read = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", taskId: "task-1" }), env));
      expect(read.result.structuredContent).toEqual({
        run: { id: "run-1", revision: 2 },
        sectionId: "section-1",
        task: expect.objectContaining({ id: "task-1", notes }),
      });
    });

    it.each([
      ["one byte over 30KB", `${"界".repeat(MAX_TASK_NOTES_BYTES / 3)}n`, "10,241 characters and 30,721 bytes"],
      ["of three-byte text far under 20,000 characters", "界".repeat(10_241), "10,241 characters and 30,723 bytes"],
      ["of four-byte emoji", "🚀".repeat(MAX_TASK_NOTES_BYTES / 4 + 1), "15,362 characters and 30,724 bytes"],
      ["over 20,000 characters", "n".repeat(MAX_TASK_NOTES_LENGTH + 1), "20,001 characters and 20,001 bytes"],
    ])("refuses notes %s, naming both limits, before reading the run", async (_notes, notes, size) => {
      const body = await setNotes(notes);

      expect(body.error.code).toBe(-32602);
      expect(body.error.data.code).toBe("invalid_arguments");
      expect(body.error.message).toBe("notes: Too long: notes can be at most 20,000 characters and 30KB (30,720 bytes "
        + `of UTF-8); these are ${size}. Send shorter notes`);
      expect(body.error.data.details.issues).toEqual([{ path: "notes", message: body.error.message.slice("notes: ".length) }]);
      expect(dbMocks.db.select).not.toHaveBeenCalled();
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("replaces longer notes written in the web app, which get_run reads in parts", async () => {
      const [section] = JSON.parse(personalRun().items as string);
      section.items[0].notes = "界".repeat(40_000);
      const run = personalRun({ items: JSON.stringify([section]) });

      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      const read = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", taskId: "task-1" }), env));
      expect(read.result.structuredContent.part).toMatchObject({ of: "task", from: 0 });
      expect(typeof read.result.structuredContent.nextCursor).toBe("string");

      const replaced = await setNotes("Rollback verified; details in the incident doc.", run);
      expect(replaced.result.isError).toBeUndefined();
      expect(replaced.result.structuredContent.task).toEqual(expect.objectContaining({
        id: "task-1",
        notes: "Rollback verified; details in the incident doc.",
      }));
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

  it("returns retired work from get_run but keeps list_runs small", async () => {
    const retired = [
      { kind: "item", sectionId: "section-1", item: { id: "task-dns", title: "Check DNS", isCompleted: true, notes: "TTL lowered" } },
    ];
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);

    const getResponse = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const getBody = await getResponse.json() as any;
    expect(getBody.result.structuredContent.run.retiredItems).toEqual(retired);

    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ retired_items: JSON.stringify(retired) })]);
    const listResponse = await handleAgentMcp(callTool("list_runs"), env);
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

      const body = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env));
      const { sections, retiredItems } = body.result.structuredContent.run;

      expectOnlySubTasks(sections[0].items[0]);
      expectOnlySubTasks(retiredItems[0].item);
      expectOnlySubTasks(retiredItems[1].section.items[0]);
    });

    it("leaves them out of the task update_run returns, but keeps the stored ones on the task", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run()]);

      const body = await toolBody(await handleAgentMcp(callTool("update_run", {
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
    // Small live sections; one retired section over the result bound on its own.
    const retiredHeavyRun = personalRun({
      retired_items: JSON.stringify([retiredSection("old-section", 2, 30_000), retiredTask, retiredSubtask]),
    });

    let readCount = 0;
    async function getRun(run: JsonRecord, args: JsonRecord = {}) {
      // A key of its own per read keeps a long walk under the per-key request limit.
      vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...identity, keyId: `retired-read-${readCount++}` });
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      const body = await toolBody(await handleAgentMcp(callTool("get_run", { runId: "run-1", ...args }), env));
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      return body.result;
    }

    it("reads retired work with retired: true, all of it or one section's or task's", async () => {
      const whole = await getRun(retiredHeavyRun);
      expect(whole.structuredContent).toMatchObject({ sectionsOmitted: true, run: { retiredCount: 3 } });

      const section = await getRun(retiredHeavyRun, { retired: true, sectionId: "section-1" });
      expect(section.structuredContent).toEqual({ run: { id: "run-1", revision: 1 }, retiredItems: [retiredTask, retiredSubtask] });
      expect(section.content[0].text).toMatch(/^Loaded 2 retired entries\./);

      const task = await getRun(retiredHeavyRun, { retired: true, taskId: "task-1" });
      expect(task.structuredContent.retiredItems).toEqual([retiredSubtask]);

      const oldTask = await getRun(retiredHeavyRun, { retired: true, sectionId: "old-section", taskId: "old-section-task-1" });
      expect(oldTask.structuredContent.retiredItems).toEqual([{
        kind: "section",
        section: {
          id: "old-section",
          title: "Retired old-section",
          items: [expect.objectContaining({ id: "old-section-task-1", notes: "x".repeat(30_000) })],
        },
      }]);

      const live = await getRun(retiredHeavyRun, { sectionId: "old-section" });
      expect(live.structuredContent).toMatchObject({ error: "section_not_found" });
      expect(live.structuredContent.message).toContain("retired: true");
    });

    it.each([
      ["a large retired section", retiredHeavyRun],
      ["large live and retired work in the same section", personalRun({
        items: JSON.stringify(largeSections(600 * 1024)),
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

  it("logs the key ID for every authenticated request, including malformed ones, never the secret", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);
      const toolRequest = callTool("get_run", { runId: "run-1" });
      toolRequest.headers.set("Authorization", "Bearer slrk_secret-canary");
      toolRequest.headers.set("X-Request-Id", "req-123");
      await handleAgentMcp(toolRequest, env);

      const malformed = new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer slrk_secret-canary",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-Request-Id": "req-456",
        },
        body: "{not json",
      });
      await handleAgentMcp(malformed, env);

      const entries = info.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(entries).toContainEqual(expect.objectContaining({ message: "mcp_request", requestId: "req-123", keyId: "key-1" }));
      expect(entries).toContainEqual(expect.objectContaining({
        message: "mcp_tool_call",
        requestId: "req-123",
        keyId: "key-1",
        toolName: "get_run",
      }));
      expect(entries).toContainEqual(expect.objectContaining({ message: "mcp_request", requestId: "req-456", keyId: "key-1" }));
      expect(JSON.stringify(entries)).not.toContain("secret-canary");
    } finally {
      info.mockRestore();
    }
  });

  it("refuses an IP that keeps failing authentication before reading D1", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const fromIp = () => {
      const request = rpcRequest("ping");
      request.headers.set("CF-Connecting-IP", "203.0.113.7");
      return request;
    };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await handleAgentMcp(fromIp(), env)).status).toBe(401);
    }
    vi.mocked(authenticatePersonalRunKey).mockClear();

    const blocked = await handleAgentMcp(fromIp(), env);
    expect(blocked.status).toBe(429);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();

    const otherIp = rpcRequest("ping");
    otherIp.headers.set("CF-Connecting-IP", "203.0.113.8");
    expect((await handleAgentMcp(otherIp, env)).status).toBe(401);
  });

  it("counts failed authentication from IPv6 addresses per /64, like the router's limits", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(null);
    const fromIp = (ip: string) => {
      const request = rpcRequest("ping");
      request.headers.set("CF-Connecting-IP", ip);
      return request;
    };
    // A new address in the same /64 for every attempt.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await handleAgentMcp(fromIp(`2001:db8:5:6::${(attempt + 1).toString(16)}`), env)).status).toBe(401);
    }
    vi.mocked(authenticatePersonalRunKey).mockClear();

    expect((await handleAgentMcp(fromIp("2001:db8:5:6:ffff::1"), env)).status).toBe(429);
    expect(authenticatePersonalRunKey).not.toHaveBeenCalled();
    expect((await handleAgentMcp(fromIp("2001:db8:5:7::1"), env)).status).toBe(401);
  });

  it("hides a personal run owned by another user", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ user_id: "user-2" })]);

    const response = await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error).toBe("run_not_found");
  });

  describe("strict JSON clients", () => {
    // JSON.stringify writes a paired surrogate (an emoji) as the character itself and
    // escapes only a lone surrogate, which serde_json (the Codex client) rejects. Any
    // surrogate escape in a response body therefore breaks the whole response.
    const LONE_SURROGATE_ESCAPE = /\\ud[89a-f][0-9a-f]{2}/i;

    const ownedTemplateRow = (overrides: JsonRecord) => ({
      id: "template-1",
      user_id: "user-1",
      owner_type: "user",
      team_id: null,
      deleted_at: null,
      title: "Launch SOP",
      description: null,
      items: "[]",
      ...overrides,
    });

    it("keeps list_templates parseable when a description is cut at an emoji", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        ownedTemplateRow({ description: `${"a".repeat(498)}\u{1F680}${"b".repeat(60)}` }),
      ]);

      const raw = await (await handleAgentMcp(callTool("list_templates"), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      const description = JSON.parse(raw).result.structuredContent.templates[0].description as string;
      expect(description.length).toBeLessThanOrEqual(500);
      expect(description.endsWith("…")).toBe(true);
    });

    it("keeps get_run parseable when a long run title is cut at an emoji", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        personalRun({ title: `${"R".repeat(158)}\u{1F680}${"x".repeat(40)}` }),
      ]);

      const raw = await (await handleAgentMcp(callTool("get_run", { runId: "run-1" }), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      expect(JSON.parse(raw).result.structuredContent.run.title).toBe(`${"R".repeat(158)}\u{1F680}${"x".repeat(40)}`);
    });

    it("replaces lone surrogates already stored in template text", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        ownedTemplateRow({ title: "Broken \uD83D title", description: "Half \uDE80 emoji" }),
      ]);

      const raw = await (await handleAgentMcp(callTool("list_templates"), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      const [template] = JSON.parse(raw).result.structuredContent.templates;
      expect(template.title).toBe("Broken � title");
      expect(template.description).toBe("Half � emoji");
    });
  });

  describe("error logging", () => {
    type LogLine = Record<string, unknown>;

    const withRequestId = (request: Request, requestId = "req-123", authorization?: string) => {
      const headers = new Headers(request.headers);
      headers.set("X-Request-Id", requestId);
      if (authorization) headers.set("Authorization", authorization);
      return new Request(request, { headers });
    };

    const consoleSpies: { mockRestore: () => void }[] = [];

    const captureLogs = () => {
      const lines: { level: string; raw: string; entry: LogLine }[] = [];
      for (const level of ["error", "warn", "info"] as const) {
        consoleSpies.push(vi.spyOn(console, level).mockImplementation((line: unknown) => {
          const raw = String(line);
          lines.push({ level, raw, entry: JSON.parse(raw) as LogLine });
        }));
      }
      const entries = (level: string) => lines.filter((line) => line.level === level).map((line) => line.entry);
      return {
        errors: () => entries("error"),
        warnings: () => entries("warn"),
        raw: () => lines.map((line) => line.raw).join("\n"),
      };
    };

    afterEach(() => {
      for (const spy of consoleSpies.splice(0)) spy.mockRestore();
    });

    it("logs an unexpected tool failure with the request id and tool name", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockRejectedValueOnce(new Error("D1_ERROR: no such column: content_version"));

      const response = await handleAgentMcp(withRequestId(callTool("list_templates")), env);

      expect(response.status).toBe(200);
      expect((await response.json() as any).error).toEqual({ code: -32603, message: "Internal error" });
      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_error",
        requestId: "req-123",
        tool: "list_templates",
        keyId: "key-1",
        errorMessage: "D1_ERROR: no such column: content_version",
      })]);
    });

    it("never logs query parameters, tool arguments, or the Run Key", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
      const queryError = Object.assign(
        new Error('Failed query: insert into "audit_events" values (?, ?)\nparams: secret-note@example.com,Evidence'),
        { cause: new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG") },
      );
      dbMocks.db.batch.mockRejectedValueOnce(queryError);

      await handleAgentMcp(withRequestId(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      }), "req-456", "Bearer slrk_secret_run_key"), env);

      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_error",
        requestId: "req-456",
        tool: "update_run",
        errorMessage: "D1_ERROR: string or blob too big: SQLITE_TOOBIG",
      })]);
      expect(logs.raw()).not.toContain("secret-note@example.com");
      expect(logs.raw()).not.toContain("Evidence");
      expect(logs.raw()).not.toContain("slrk_secret_run_key");
    });

    it("logs a failed audit and run update invariant with the run and change counts", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);
      dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 0 } }]);

      await handleAgentMcp(withRequestId(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 2,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Evidence",
      })), env);

      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_tool_invariant",
        requestId: "req-123",
        tool: "update_run",
        runId: "run-1",
        auditChanges: 1,
        updateChanges: 0,
      })]);
    });

    it("does not log expected tool errors at error level", async () => {
      const logs = captureLogs();
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 5 })]);

      await handleAgentMcp(withRequestId(callTool("update_run", {
        runId: "run-1",
        expectedRevision: 4,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Verified locally",
      })), env);
      await handleAgentMcp(withRequestId(callTool("get_run", {})), env);
      await handleAgentMcp(withRequestId(callTool("delete_everything")), env);

      expect(logs.errors()).toEqual([]);
    });

    it("logs a Run Key authentication failure without the key", async () => {
      const logs = captureLogs();
      vi.mocked(authenticatePersonalRunKey).mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

      const response = await handleAgentMcp(
        withRequestId(callTool("list_templates"), "req-789", "Bearer slrk_secret_run_key"),
        env,
      );

      expect(response.status).toBe(500);
      expect(logs.errors()).toEqual([expect.objectContaining({
        message: "mcp_auth_error",
        requestId: "req-789",
        errorMessage: "D1_ERROR: database is locked",
      })]);
      expect(logs.raw()).not.toContain("slrk_secret_run_key");
    });

    it("logs a failed key usage update as a warning and still returns the tool result", async () => {
      const logs = captureLogs();
      vi.mocked(markPersonalRunKeyUsed).mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

      const response = await handleAgentMcp(withRequestId(callTool("list_runs")), env);

      expect((await response.json() as any).result.isError).toBeUndefined();
      expect(logs.errors()).toEqual([]);
      expect(logs.warnings()).toEqual([expect.objectContaining({
        message: "mcp_key_usage_error",
        requestId: "req-123",
        keyId: "key-1",
      })]);
    });
  });
});

