import { assert, beforeEach, describe, expect, it } from "vitest";
import { firstOf, valueAt } from "../../../support/elements";
import { dbMocks, env, personalRun, resetAgentMcpHandlerMocks, toolBody } from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_TASK_NOTES_BYTES, MAX_TASK_NOTES_LENGTH } from "@functions/api/handlers/agentMcpTools";
import { mcpArgumentsError, mcpRequest, mcpToolCall, mcpToolList } from "../../../support/agentMcp";
import { readJson } from "../../../support/readJson";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  describe("the notes update_run writes", () => {
    const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

    const sendNotes = async (notes: string, run = personalRun()) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([run]);
      return handleAgentMcp(mcpToolCall("update_run", {
        runId: "run-1",
        expectedRevision: 1,
        operation: "set_task_notes",
        taskId: "task-1",
        notes,
      }), env);
    };
    const setNotes = async (notes: string, run = personalRun()) => toolBody(await sendNotes(notes, run));

    it("keeps the limits in the advertised schema", async () => {
      expect(MAX_TASK_NOTES_BYTES).toBe(30 * 1024);
      const { tools } = (await readJson(await handleAgentMcp(mcpRequest("tools/list"), env), mcpToolList)).result;
      const updateRun = tools.find((tool) => tool.name === "update_run");
      assert.exists(updateRun);
      expect(updateRun.inputSchema.properties.notes).toMatchObject({ type: "string", maxLength: MAX_TASK_NOTES_LENGTH });
      for (const text of [updateRun.description, valueAt(updateRun.inputSchema.properties, "notes").description]) {
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

      const stored = firstOf(dbMocks.updateChain.set.mock.calls)[0].items as string;
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: stored, revision: 2 })]);
      const read = await toolBody(await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1", taskId: "task-1" }), env));
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
      const body = await readJson(await sendNotes(notes), mcpArgumentsError);

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
      const read = await toolBody(await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1", taskId: "task-1" }), env));
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
});
