import { beforeEach, describe, expect, it, vi } from "vitest";
import { elementAt, firstOf, present, taskIn, valueAt } from "../../../support/elements";
import { dbMocks, env, resetAgentMcpHandlerMocks } from "../../../support/agentMcpHandler";

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { templateView } from "@functions/api/handlers/agentMcpTemplatePages";
import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpErrorResponse, mcpRequest, mcpToolList, mcpToolResult } from "../../../support/agentMcp";
import { recordIn } from "../../../support/mcpResponses";
import { storedSectionsIn } from "../../../support/storedJson";
import { readTemplateInFull } from "../../../support/templatePages";
import { stringMatching } from "../../../support/asymmetricMatchers";

type JsonRecord = Record<string, unknown>;

let requestId = 0;
async function send(method: string, params?: JsonRecord): Promise<{ raw: string; body: JsonRecord }> {
  requestId += 1;
  const response = await handleAgentMcp(mcpRequest(method, params, requestId), env);
  const raw = await response.text();
  return { raw, body: recordIn(JSON.parse(raw)) };
}

const rpc = (name: string, args: JsonRecord) => send("tools/call", { name, arguments: args });

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

const task = (id: string, textBytes = 200) => ({
  id,
  title: `Task ${id}`,
  description: "",
  contents: [{ id: `${id}-text`, type: "text", value: "x".repeat(textBytes) }],
});

const sectionsTooLargeForOneResult = () => Array.from({ length: 30 }, (_, s) => ({
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

const resultOf = (body: { result?: unknown }) => mcpToolResult.parse(body.result);

function everySelectReads(row: JsonRecord) {
  dbMocks.selectChain.limit.mockResolvedValue([row]);
}

describe("personal run MCP template tools over the endpoint, with D1 mocked", () => {
  beforeEach(() => {
    resetAgentMcpHandlerMocks();
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  });

  it("advertises get_template's paging arguments and update_template's operations", async () => {
    const { tools } = mcpToolList.parse((await send("tools/list")).body).result;
    const schema = (name: string) => present(tools.find((tool) => tool.name === name), name).inputSchema;

    expect(Object.keys(schema("get_template").properties)).toEqual(["templateId", "sectionId", "taskId", "cursor"]);
    expect(schema("get_template").required).toEqual(["templateId"]);
    const update = schema("update_template");
    expect(valueAt(update.properties, "operation")).toMatchObject({
      enum: ["replace_section", "insert_section", "move_section", "remove_section", "replace_task", "insert_task", "move_task", "remove_task"],
    });
    expect(update.required).toEqual(["templateId", "expectedVersion"]);
    for (const keyword of ["oneOf", "anyOf", "allOf"]) expect(update).not.toHaveProperty(keyword);
  });

  it("warns that sections, accepted for a template of any size, replaces the whole checklist, and to edit a template read in pages by part", async () => {
    const { tools } = mcpToolList.parse((await send("tools/list")).body).result;
    const update = present(tools.find((tool) => tool.name === "update_template"), "update_template");
    const sections = valueAt(update.inputSchema.properties, "sections");

    expect(update.description).toContain(
      "sections, which replaces the whole checklist: any section, task, or subtask it leaves out is removed.",
    );
    expect(update.description).toContain(
      "For a template read in pages (get_template returned an outline or nextCursor), operation is the safe way to edit it",
    );
    expect(sections.description).toMatch(/^The whole checklist, its sections in order: it replaces every section/);
    expect(sections.description).toContain("For a template read in pages, change it with operation instead.");
  });

  it("reads a template too large for one result in pages, each response within the bound", async () => {
    const row = templateRow(sectionsTooLargeForOneResult());
    everySelectReads(row);
    const responses: string[] = [];

    const { template } = await readTemplateInFull(async (args) => {
      const { raw, body } = await rpc("get_template", args);
      responses.push(raw);
      const result = resultOf(body);
      expect(result.isError).toBeUndefined();
      const summaryForClientsThatShowText = firstOf(result.content).text.split("\n\n")[0];
      expect(summaryForClientsThatShowText).toMatch(/^(Template "Release SOP" is too large|Loaded section "Section \d+"\.)/);
      return result.structuredContent;
    }, "template-1");

    const view = templateView(row);
    expect(template).toEqual({ ...view.header, sections: view.sections });
    expect(responses).toHaveLength(31);
    for (const raw of responses) {
      const result = resultOf(recordIn(JSON.parse(raw)));
      expect(bytes(JSON.stringify(result.structuredContent))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    }
    expect(markPersonalRunKeyUsed).toHaveBeenCalledTimes(31);
  });

  it("refuses a stale cursor with edit_conflict and a forged one as invalid arguments", async () => {
    everySelectReads(templateRow([{ id: "big", title: "Big", items: Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500)) }]));
    const first = resultOf((await rpc("get_template", { templateId: "template-1", sectionId: "big" })).body).structuredContent;
    expect(typeof first.nextCursor).toBe("string");

    everySelectReads(templateRow([], { version: 5 }));
    const stale = resultOf((await rpc("get_template", { templateId: "template-1", cursor: first.nextCursor })).body);
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({ error: "edit_conflict", details: { expectedVersion: 4, currentVersion: 5 } });

    const forged = (await rpc("get_template", { templateId: "template-1", cursor: "bm90LWEtY3Vyc29y" })).body;
    const { error } = mcpErrorResponse.parse(forged);
    expect(error.code).toBe(-32602);
    expect(recordIn(error.data).code).toBe("invalid_arguments");
  });

  describe("update_template operations", () => {
    const sections = () => [
      { id: "s1", title: "Prepare", items: [task("t1"), task("t2")] },
      { id: "s2", title: "Ship", items: [task("t3")] },
    ];

    function mockWrite(before: JsonRecord, after: JsonRecord) {
      const ownedTemplateCheck = [before];
      const editorRead = [before];
      const resultReadBack = [after];
      dbMocks.selectChain.limit
        .mockResolvedValueOnce(ownedTemplateCheck)
        .mockResolvedValueOnce(editorRead)
        .mockResolvedValueOnce(resultReadBack);
    }

    const savedTemplate = () => dbMocks.updateChain.set.mock.calls
      .map(([values]) => values)
      .find((values) => typeof values.items === "string");

    it("saves the whole checklist with one task added, through the editor's code, naming the key and operation in its history", async () => {
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
      const saved = storedSectionsIn(savedTemplate()?.items);
      const inserted = elementAt(firstOf(saved).items, 1);
      expect(firstOf(saved).items.map(({ id }) => id)).toEqual(["t1", inserted.id, "t2"]);
      expect(inserted).toMatchObject({ id: stringMatching(/^item_/), title: "Freeze merges" });
      expect(saved[1]).toEqual(sections()[1]);
      expect(savedTemplate()).toMatchObject({ version: 5, content_version: 4 });

      const audit = vi.mocked(buildAuditEventValues).mock.calls.map(([values]) => values)
        .find((values) => values.action === "template.updated");
      expect(audit?.metadata).toEqual({ source: "mcp", operation: "insert_task", personalRunKeyId: "key-1", personalRunKeyName: "Codex" });
      expect(result.structuredContent).toMatchObject({ template: { id: "template-1", version: 5 } });
      expect(firstOf(result.content).text).toMatch(/^Updated template "Release SOP"\./);
    });

    it("refuses a stale version, a public template, and an unknown section before writing", async () => {
      everySelectReads(templateRow(sections()));
      const stale = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 3,
        operation: "remove_task",
        taskId: "t1",
      })).body);
      expect(stale.structuredContent).toMatchObject({ error: "edit_conflict", details: { expectedVersion: 3, currentVersion: 4 } });

      everySelectReads(templateRow(sections(), { is_public: true }));
      const published = resultOf((await rpc("update_template", {
        templateId: "template-1",
        expectedVersion: 4,
        operation: "remove_task",
        taskId: "t1",
      })).body);
      expect(published.structuredContent).toMatchObject({ error: "template_is_public" });

      everySelectReads(templateRow(sections()));
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
      const before = templateRow(sectionsTooLargeForOneResult());
      const changed = sectionsTooLargeForOneResult();
      elementAt(changed, 3).items[2] = { ...taskIn(changed, 3, 2), title: "Rolled back" };
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
        task: taskIn(changed, 3, 2),
      });
      expect(bytes(JSON.stringify(resultOf(recordIn(JSON.parse(raw))).structuredContent))).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    });

    it("treats a null operation as absent, replacing fields as before", async () => {
      const editorRead = [templateRow(sections())];
      const resultReadBack = [templateRow(sections(), { version: 5, title: "Release SOP v2" })];
      dbMocks.selectChain.limit.mockResolvedValueOnce(editorRead).mockResolvedValueOnce(resultReadBack);

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
