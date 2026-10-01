import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dbMocks,
  env,
  finishedRun,
  personalRun,
  resetAgentMcpHandlerMocks,
  toolBody,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { updateRunArgs } from "@functions/api/handlers/agentMcpTools";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { mcpRequest, mcpToolCall, runKeyWithEveryPermission } from "../../../support/agentMcp";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("advertises personal template and run tools without delete or publish controls", async () => {
    const response = await handleAgentMcp(mcpRequest("tools/list"), env);
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

  it("offers and allows only the tools a key's permissions cover", async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...runKeyWithEveryPermission, permissions: ["runs:read"] });

    const listResponse = await handleAgentMcp(mcpRequest("tools/list"), env);
    const list = await listResponse.json() as any;
    expect(list.result.tools.map((tool: any) => tool.name)).toEqual(["list_runs", "get_run"]);

    const deniedResponse = await handleAgentMcp(mcpToolCall("create_template", {
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

  describe("tool input schemas", () => {
    const ROOT_KEYWORDS_CLIENTS_REJECT = ["oneOf", "anyOf", "allOf", "not", "if", "then", "else", "$ref", "enum", "const"];

    async function listTools(): Promise<any[]> {
      return (await toolBody(await handleAgentMcp(mcpRequest("tools/list"), env))).result.tools;
    }

    function problemsAClientFindsAgainstTheAdvertisedSchema(schema: any, args: JsonRecord): string[] {
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
      expect(problemsAClientFindsAgainstTheAdvertisedSchema(updateRun.inputSchema, args)).toEqual([]);

      const unused = Object.fromEntries(["taskId", "subtaskId", "completed", "notes", "status"]
        .filter((name) => !(name in fields))
        .map((name) => [name, null]));
      dbMocks.selectChain.limit.mockResolvedValueOnce([operation === "set_run_status" ? finishedRun() : personalRun()]);
      const body = await toolBody(await handleAgentMcp(mcpToolCall("update_run", { ...args, ...unused }), env));

      expect(body.error).toBeUndefined();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.run.revision).toBe(2);
    });

    it("names the offending field when update_run arguments do not fit the operation", async () => {
      const missing = await toolBody(await handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
      }), env));
      expect(missing.error.code).toBe(-32602);
      expect(missing.error.message).toContain("notes");

      const extra = await toolBody(await handleAgentMcp(mcpToolCall("update_run", {
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
});
