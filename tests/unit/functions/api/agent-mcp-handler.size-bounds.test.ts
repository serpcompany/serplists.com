import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstOf, present, valueAt } from "../../../support/elements";
import { storedSectionsIn } from "../../../support/storedJson";
import { z } from "zod";
import {
  byteLength,
  callTool,
  dbMocks,
  env,
  everyUpdateRunOperation,
  finishedIfCompleting,
  getRunWithinTheBound,
  NO_TEMPLATE_HOLDS_THE_SLUG,
  ownedTemplate,
  personalRun,
  resetAgentMcpHandlerMocks,
  sectionsOfAtLeast,
  toolBody,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { MAX_TASK_NOTES_BYTES } from "@functions/api/handlers/agentMcpTools";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES, TEMPLATE_CONTENT_MAX_BYTES } from "@/lib/schemas/contentLimits";
import { mcpRequest, mcpToolCall, mcpToolList, runKeyWithEveryPermission } from "../../../support/agentMcp";
import { jsonObject, readJson } from "../../../support/readJson";
import { anyInstanceOf, objectContaining } from "../../../support/asymmetricMatchers";

const sectionPage = z.object({ section: z.object({ firstTask: z.number(), items: z.array(jsonObject) }).passthrough() }).passthrough();

const setTaskNotes = (expectedRevision: number, notes: string) =>
  callTool("update_run", { runId: "run-1", expectedRevision, operation: "set_task_notes", taskId: "task-1", notes });

function expectTooLargeToSaveAndNothingWritten(body: Awaited<ReturnType<typeof callTool>>) {
  expect(body.result.isError).toBe(true);
  expect(body.result.structuredContent).toMatchObject({ error: "content_too_large", details: { limit: RUN_CONTENT_MAX_BYTES } });
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("returns a run too large for one result as its outline, within the bound", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      items: JSON.stringify([{ id: "section-1", title: "Release", items: [{ id: "task-1", notes: "x".repeat(600_000) }] }]),
    })]);

    const body = await callTool("get_run", { runId: "run-1" });

    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toMatchObject({
      run: { id: "run-1", revision: 1, sectionCount: 1, taskCount: 1, retiredCount: 0 },
      sectionsOmitted: true,
      outline: [{ id: "section-1", title: "Release", taskCount: 1 }],
      limit: MAX_RESULT_BYTES,
    });
    expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(firstOf(body.result.content).text).toMatch(/^Run "Release SOP" is too large to return at once, so this is its outline/);
    expect(markPersonalRunKeyUsed).toHaveBeenCalled();
  });

  describe("run size bounds", () => {
    const templateSectionsPaddedWithDescriptions = (targetBytes: number) => sectionsOfAtLeast(targetBytes).map((section) => ({
      ...section,
      items: (section.items as JsonRecord[]).map(({ notes, ...task }) => ({ ...task, description: notes })),
    }));

    it("rejects start_run on a template whose run would be too large to save, before writing anything", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(templateSectionsPaddedWithDescriptions(RUN_CONTENT_MAX_BYTES + 32 * 1024))]);

      const body = await callTool("start_run", { templateId: "template-1" });

      expectTooLargeToSaveAndNothingWritten(body);
      expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
    });

    it("starts a run from a template at the template limit and returns its fields without sections", async () => {
      const sections = templateSectionsPaddedWithDescriptions(TEMPLATE_CONTENT_MAX_BYTES - 24 * 1024);
      expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(sections)]);

      const body = await callTool("start_run", { templateId: "template-1" });

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent).toEqual({
        run: objectContaining({ templateId: "template-1", title: "Release SOP", revision: 1, progress: 0 }),
        sectionsOmitted: true,
      });
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(firstOf(body.result.content).text).toBe(
        `Started run "Release SOP". It is too large for one result; read it with get_run.\n\n${toJson(body.result.structuredContent)}`,
      );
    });

    it("rejects set_task_notes that pushes a run past the content limit without writing", async () => {
      const sections = sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES - 24 * 1024);
      expect(contentSaveBytes(sections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
      expect(contentSaveBytes(sections) + 20_000).toBeGreaterThan(RUN_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify(sections) })]);

      const body = await setTaskNotes(1, "n".repeat(20_000));

      expectTooLargeToSaveAndNothingWritten(body);
    });

    it("counts notes by UTF-8 bytes, not characters", async () => {
      const asciiNotes = "n".repeat(20_000);
      const threeByteNotes = "界".repeat(10_000);
      const threeByteNotesBytes = new TextEncoder().encode(threeByteNotes).byteLength;
      const sections = sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES - 32 * 1024);
      const bytesLeftUnderTheRunLimit = RUN_CONTENT_MAX_BYTES - contentSaveBytes(sections);
      expect(bytesLeftUnderTheRunLimit).toBeGreaterThan(asciiNotes.length);
      expect(bytesLeftUnderTheRunLimit).toBeLessThan(threeByteNotesBytes);
      expect(threeByteNotesBytes).toBeLessThanOrEqual(MAX_TASK_NOTES_BYTES);
      const setNotes = (notes: string) => {
        dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify(sections) })]);
        return setTaskNotes(1, notes);
      };

      expect((await setNotes(threeByteNotes)).result.structuredContent.error).toBe("content_too_large");
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
      expect((await setNotes(asciiNotes)).result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
    });

    it.each(everyUpdateRunOperation({ taskId: "filler-0", notes: "" }))("never reports a committed %s on a run over the content limit as a failure", async (operation, fields) => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(finishedIfCompleting(operation, sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES + 64 * 1024))),
        revision: 7,
      })]);

      const body = await callTool("update_run", { runId: "run-1", expectedRevision: 7, operation, ...fields });

      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.run).toEqual(objectContaining({ id: "run-1", revision: 8 }));
      expect(byteLength(body.result.structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, runKeyWithEveryPermission);
    });

    it.each([
      ["set_task_completed", { taskId: "task-1", completed: false }],
      ["set_subtask_completed", { taskId: "task-1", subtaskId: "sub-1", completed: false }],
    ])("allows unchecking with %s on a run already over the content limit, which counts every task as unticked", async (operation, fields) => {
      const sections = sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES + 64 * 1024);
      const task1 = firstOf(firstOf(sections).items as JsonRecord[]);
      task1.isCompleted = true;
      for (const subtask of firstOf(task1.contents as JsonRecord[]).subItems as JsonRecord[]) subtask.isCompleted = true;
      expect(contentSaveBytes(sections)).toBeGreaterThan(RUN_CONTENT_MAX_BYTES);
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
        items: JSON.stringify(sections),
        progress: 1,
        revision: 7,
      })]);

      const body = await callTool("update_run", { runId: "run-1", expectedRevision: 7, operation, ...fields });

      expect(body.result.isError).toBeUndefined();
      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent.run).toEqual(objectContaining({ id: "run-1", revision: 8 }));
      expect(body.result.structuredContent.task).toEqual(objectContaining({ id: "task-1", isCompleted: false }));
      expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, runKeyWithEveryPermission);
    });

    it("returns every committed mutation within the result bound", async () => {
      const { tools } = (await readJson(await handleAgentMcp(mcpRequest("tools/list"), env), mcpToolList)).result;
      const mutatingTools = tools.filter((tool) => tool.annotations.readOnlyHint === false).map((tool) => tool.name);
      expect(mutatingTools).toEqual(["create_template", "update_template", "start_run", "update_run"]);

      const storedTemplateTooLargeToReturnWhole = { ...ownedTemplate(sectionsOfAtLeast(600 * 1024)), version: 2, is_public: false, slug: "release-sop" };
      const calls: Record<string, () => Promise<Response>> = {
        create_template: () => {
          dbMocks.selectChain.limit
            .mockResolvedValueOnce(NO_TEMPLATE_HOLDS_THE_SLUG)
            .mockResolvedValueOnce([storedTemplateTooLargeToReturnWhole]);
          return handleAgentMcp(mcpToolCall("create_template", {
            title: "Release SOP",
            sections: [{ title: "Release", items: [{ title: "Verify" }] }],
          }), env);
        },
        update_template: () => {
          dbMocks.selectChain.limit
            .mockResolvedValueOnce([{ ...storedTemplateTooLargeToReturnWhole, version: 1 }])
            .mockResolvedValueOnce([storedTemplateTooLargeToReturnWhole]);
          dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
          return handleAgentMcp(mcpToolCall("update_template", {
            templateId: "template-1",
            expectedVersion: 1,
            title: "Release SOP v2",
          }), env);
        },
        start_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(templateSectionsPaddedWithDescriptions(TEMPLATE_CONTENT_MAX_BYTES - 24 * 1024))]);
          return handleAgentMcp(mcpToolCall("start_run", { templateId: "template-1" }), env);
        },
        update_run: () => {
          dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
            items: JSON.stringify(sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES - 24 * 1024)),
          })]);
          return handleAgentMcp(mcpToolCall("update_run", {
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
        const body = await toolBody(await valueAt(calls, name)());
        expect(dbMocks.db.batch, name).toHaveBeenCalledOnce();
        expect(body.result.isError, name).toBeUndefined();
        const { structuredContent } = body.result;
        if (name.endsWith("_template")) {
          expect(structuredContent.template).toEqual(objectContaining({ id: anyInstanceOf(String), version: 2 }));
          expect(structuredContent.sectionsOmitted).toBe(true);
        } else {
          expect(structuredContent.run).toEqual(objectContaining({
            id: anyInstanceOf(String),
            revision: anyInstanceOf(Number),
          }));
        }
        expect(byteLength(structuredContent)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
        expect(markPersonalRunKeyUsed).toHaveBeenCalledOnce();
      }
    });

    it("returns the changed task and a compact run summary from update_run", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ revision: 2 })]);

      const body = await setTaskNotes(2, "Evidence");

      expect(body.result.structuredContent.run).not.toHaveProperty("sections");
      expect(body.result.structuredContent).toEqual({
        run: objectContaining({ id: "run-1", revision: 3 }),
        sectionId: "section-1",
        taskId: "task-1",
        task: objectContaining({ id: "task-1", notes: "Evidence" }),
      });
    });

    it("names a changed task too large for one result instead of returning it", async () => {
      const templateTextTooLargeForOneResult = "Read the runbook first. ".repeat(1_500);
      const section = firstOf(storedSectionsIn(personalRun().items));
      present(firstOf(section.items).contents, "the task's contents").unshift({ id: "guide", type: "text", value: templateTextTooLargeForOneResult });
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify([section]), revision: 2 })]);

      const body = await setTaskNotes(2, "Evidence");

      expect(dbMocks.db.batch).toHaveBeenCalledOnce();
      expect(body.result.structuredContent).toEqual({
        run: objectContaining({ id: "run-1", revision: 3 }),
        sectionId: "section-1",
        taskId: "task-1",
        taskOmitted: true,
      });
      expect(firstOf(body.result.content).text)
        .toMatch(/^Updated run "Release SOP"\. The task is too large for one result; read it with get_run and taskId\./);
    });

    it("reads a run too large for one result a section, a page of tasks, or a task at a time", async () => {
      const oversized = personalRun({ items: JSON.stringify(sectionsOfAtLeast(600 * 1024)) });
      const read = (args: JsonRecord) => getRunWithinTheBound(oversized, args);

      const task = await read({ taskId: "task-1" });
      expect(task.isError).toBeUndefined();
      expect(task.structuredContent).toEqual({
        run: { id: "run-1", revision: 1 },
        sectionId: "section-1",
        task: objectContaining({ id: "task-1", title: "Verify" }),
      });

      const firstPage = await read({ sectionId: "section-1" });
      expect(firstPage.structuredContent.section).toMatchObject({ id: "section-1", taskCount: anyInstanceOf(Number), firstTask: 0 });
      const nextPage = await read({ cursor: firstPage.structuredContent.nextCursor });
      expect(sectionPage.parse(nextPage.structuredContent).section.firstTask)
        .toBe(sectionPage.parse(firstPage.structuredContent).section.items.length);
      expect(firstOf(nextPage.content).text).toMatch(/^Loaded tasks \d+-\d+ of the \d+ in a section too large for one result\./);

      expect((await read({ taskId: "nope" })).structuredContent.error).toBe("task_not_found");

      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun()]);
      const section = await callTool("get_run", { runId: "run-1", sectionId: "section-1" });
      expect(section.result.structuredContent).toEqual({
        run: { id: "run-1", revision: 1 },
        section: objectContaining({ id: "section-1", title: "Release" }),
      });
    });
  });
});
