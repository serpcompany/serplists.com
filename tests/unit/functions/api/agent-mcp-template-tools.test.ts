import { beforeEach, describe, expect, it, vi } from "vitest";

// get_template's pages and update_template's operations over the MCP endpoint, with D1
// mocked: what a client receives, and what an operation saves through the editor's code.
const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
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

vi.mock("@functions/api/utils/entitlements", () => ({ getEntitlementsForUser: vi.fn() }));

// Pass through, but record what each write puts in audit_events.
vi.mock("@functions/api/utils/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@functions/api/utils/audit")>();
  return { ...actual, buildAuditEventValues: vi.fn(actual.buildAuditEventValues) };
});

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { templateView } from "@functions/api/handlers/agentMcpTemplatePages";
import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { getEntitlementsForUser } from "@functions/api/utils/entitlements";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { readTemplateInFull } from "../../../support/templatePages";

type JsonRecord = Record<string, unknown>;

const identity = {
  keyId: "key-1",
  userId: "user-1",
  name: "Codex",
  permissions: ["templates:read", "templates:write", "runs:read", "runs:write"] as const,
};
const env = { DB: {} } as never;

let requestId = 0;
async function send(method: string, params?: JsonRecord): Promise<{ raw: string; body: JsonRecord }> {
  requestId += 1;
  const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, ...(params ? { params } : {}) }),
  }), env);
  const raw = await response.text();
  return { raw, body: JSON.parse(raw) as JsonRecord };
}

const rpc = (name: string, args: JsonRecord) => send("tools/call", { name, arguments: args });

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

const task = (id: string, textBytes = 200) => ({
  id,
  title: `Task ${id}`,
  description: "",
  contents: [{ id: `${id}-text`, type: "text", value: "x".repeat(textBytes) }],
});

// A template of 30 sections of 12 tasks, about 120KB: too large for one result.
const largeSections = () => Array.from({ length: 30 }, (_, s) => ({
  id: `s${s}`,
  title: `Section ${s}`,
  items: Array.from({ length: 12 }, (_, t) => task(`t${s}-${t}`)),
}));

const templateRow = (sections: unknown[], overrides: JsonRecord = {}): JsonRecord => ({
  id: "template-1",
  user_id: "user-1",
  owner_type: "user",
  team_id: null,
  deleted_at: null,
  is_public: false,
  slug: "release-sop",
  title: "Release SOP",
  description: "How we ship",
  type: "checklist",
  category: "[]",
  tags: "[]",
  items: JSON.stringify(sections),
  version: 4,
  content_version: 3,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  ...overrides,
});

const resultOf = (body: JsonRecord) => body.result as { structuredContent: JsonRecord; content: Array<{ text: string }>; isError?: boolean };

// The row every select reads, and what the batch reports.
function storedRow(row: JsonRecord) {
  dbMocks.selectChain.limit.mockResolvedValue([row]);
}

describe("personal run MCP template tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.db.batch.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue({ kind: "insert" });
    dbMocks.insertChain.select.mockReturnValue({ kind: "conditional-insert" });
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue(identity);
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: "pro", limits: { maxTemplates: null, maxActiveRuns: null } } as never);
  });

  it("advertises get_template's paging arguments and update_template's operations", async () => {
    const tools = ((await send("tools/list")).body.result as { tools: JsonRecord[] }).tools;
    const schema = (name: string) => tools.find((tool) => tool.name === name)?.inputSchema as JsonRecord;

    expect(Object.keys(schema("get_template").properties as JsonRecord)).toEqual(["templateId", "sectionId", "taskId", "cursor"]);
    expect(schema("get_template").required).toEqual(["templateId"]);
    const update = schema("update_template");
    expect((update.properties as JsonRecord).operation).toMatchObject({
      enum: ["replace_section", "insert_section", "move_section", "remove_section", "replace_task", "insert_task", "move_task", "remove_task"],
    });
    expect(update.required).toEqual(["templateId", "expectedVersion"]);
    for (const keyword of ["oneOf", "anyOf", "allOf"]) expect(update).not.toHaveProperty(keyword);
  });

  it("reads a template too large for one result in pages, each response within the bound", async () => {
    const row = templateRow(largeSections());
    storedRow(row);
    const responses: string[] = [];

    const { template } = await readTemplateInFull(async (args) => {
      const { raw, body } = await rpc("get_template", args);
      responses.push(raw);
      const result = resultOf(body);
      expect(result.isError).toBeUndefined();
      // The text a client that shows text reads starts with what the page holds.
      expect(result.content[0].text.split("\n\n")[0]).toMatch(/^(Template "Release SOP" is too large|Loaded section "Section \d+"\.)/);
      return result.structuredContent;
    }, "template-1");

    const view = templateView(row);
    expect(template).toEqual({ ...view.header, sections: view.sections });
    expect(responses).toHaveLength(31);
    for (const raw of responses) {
      const result = resultOf(JSON.parse(raw) as JsonRecord);
      expect(bytes(JSON.stringify(result.structuredContent))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    }
    expect(markPersonalRunKeyUsed).toHaveBeenCalledTimes(31);
  });

  it("refuses a stale cursor with edit_conflict and a forged one as invalid arguments", async () => {
    storedRow(templateRow([{ id: "big", title: "Big", items: Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500)) }]));
    const first = resultOf((await rpc("get_template", { templateId: "template-1", sectionId: "big" })).body).structuredContent;
    expect(typeof first.nextCursor).toBe("string");

    storedRow(templateRow([], { version: 5 }));
    const stale = resultOf((await rpc("get_template", { templateId: "template-1", cursor: first.nextCursor })).body);
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({ error: "edit_conflict", details: { expectedVersion: 4, currentVersion: 5 } });

    const forged = (await rpc("get_template", { templateId: "template-1", cursor: "bm90LWEtY3Vyc29y" })).body;
    expect((forged.error as JsonRecord).code).toBe(-32602);
    expect(((forged.error as JsonRecord).data as JsonRecord).code).toBe("invalid_arguments");
  });

  describe("update_template operations", () => {
    const sections = () => [
      { id: "s1", title: "Prepare", items: [task("t1"), task("t2")] },
      { id: "s2", title: "Ship", items: [task("t3")] },
    ];

    // getOwnedTemplate, then updateTemplateForUser's read, then the result's read back.
    function mockWrite(before: JsonRecord, after: JsonRecord) {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([before])
        .mockResolvedValueOnce([before])
        .mockResolvedValueOnce([after]);
    }

    const savedTemplate = () => dbMocks.updateChain.set.mock.calls
      .map(([values]) => values as JsonRecord)
      .find((values) => typeof values.items === "string");

    it("saves the whole checklist with one task added, through the editor's code", async () => {
      const before = templateRow(sections());
      mockWrite(before, templateRow(sections(), { version: 5 }));

      const { body } = await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: "insert_task",
        beforeTaskId: "t2",
        task: { title: "Freeze merges" },
      });
      const result = resultOf(body);

      expect(result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      const saved = JSON.parse(String(savedTemplate()?.items)) as JsonRecord[];
      const inserted = (saved[0].items as JsonRecord[])[1];
      expect((saved[0].items as JsonRecord[]).map(({ id }) => id)).toEqual(["t1", inserted.id, "t2"]);
      expect(inserted).toMatchObject({ id: expect.stringMatching(/^item_/), title: "Freeze merges" });
      expect(saved[1]).toEqual(sections()[1]);
      expect(savedTemplate()).toMatchObject({ version: 5, content_version: 4 });

      // The template's history names the key and the operation.
      const audit = vi.mocked(buildAuditEventValues).mock.calls.map(([values]) => values)
        .find((values) => values.action === "template.updated");
      expect(audit?.metadata).toEqual({ source: "mcp", operation: "insert_task", personalRunKeyId: "key-1", personalRunKeyName: "Codex" });
      expect(result.structuredContent).toMatchObject({ template: { id: "template-1", version: 5 } });
      expect(result.content[0].text).toMatch(/^Updated template "Release SOP"\./);
    });

    it("refuses a stale version, a public template, and an unknown section before writing", async () => {
      storedRow(templateRow(sections()));
      const stale = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 3,
        operation: "remove_task",
        taskId: "t1",
      })).body);
      expect(stale.structuredContent).toMatchObject({ error: "edit_conflict", details: { expectedVersion: 3, currentVersion: 4 } });

      storedRow(templateRow(sections(), { is_public: true }));
      const published = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: "remove_task",
        taskId: "t1",
      })).body);
      expect(published.structuredContent).toMatchObject({ error: "template_is_public" });

      storedRow(templateRow(sections()));
      const missing = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: "move_section",
        sectionId: "s9",
      })).body);
      expect(missing.structuredContent).toMatchObject({ error: "section_not_found", message: "Section not found (sectionId)" });

      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("returns a large template's fields and the changed task, within the bound", async () => {
      const before = templateRow(largeSections());
      const changed = largeSections();
      changed[3].items[2] = { ...changed[3].items[2], title: "Rolled back" };
      mockWrite(before, templateRow(changed, { version: 5 }));

      const { raw, body } = await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: "replace_task",
        taskId: "t3-2",
        task: { title: "Rolled back" },
      });

      expect(resultOf(body).structuredContent).toEqual({
        template: templateView(templateRow(changed, { version: 5 })).header,
        sectionsOmitted: true,
        sectionId: "s3",
        taskId: "t3-2",
        task: changed[3].items[2],
      });
      expect(bytes(JSON.stringify(resultOf(JSON.parse(raw) as JsonRecord).structuredContent))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    });

    it("treats a null operation as absent, replacing fields as before", async () => {
      // updateTemplateForUser's read, then the result's read back.
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([templateRow(sections())])
        .mockResolvedValueOnce([templateRow(sections(), { version: 5, title: "Release SOP v2" })]);

      const result = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: null,
        title: "Release SOP v2",
      })).body);

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ template: { title: "Release SOP v2", version: 5 } });
    });
  });
});
