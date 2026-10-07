import { beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { z } from "zod";
import { createTemplateArgs, templateToolDefinitions } from "@functions/api/handlers/agentMcpTemplateTools";
import { contentAt, firstOf, present, taskIn } from "../../../support/elements";
import { storedSectionsIn } from "../../../support/storedJson";
import {
  callTool,
  dbMocks,
  expectAToolError,
  personalRun,
  resetAgentMcpHandlerMocks,
  type JsonRecord,
} from "../../../support/agentMcpHandler";

const formBlock = (fields: JsonRecord[]) => ({ id: "c-form", type: "form", value: "", fields });
const requiredName = (answer?: string) => ({
  id: "field_name",
  label: "Client name",
  kind: "text",
  required: true,
  ...(answer === undefined ? {} : { answer }),
});
const subTasks = (secondDone: boolean) => ({
  id: "c-sub",
  type: "subItems",
  value: "",
  subItems: [{ id: "sub-1", title: "One", isCompleted: true }, { id: "sub-2", title: "Two", isCompleted: secondDone }],
});

function aRunWithTask(contents: JsonRecord[], isCompleted = false) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
    items: JSON.stringify([{ id: "section-1", title: "Kickoff", items: [{ id: "task-1", title: "Brief", isCompleted, contents }] }]),
    revision: 3,
  })]);
}

const taskView = z.object({ contents: z.array(z.unknown()) }).passthrough();
const runView = z.object({
  run: z.object({
    sections: z.array(z.object({ items: z.array(taskView) }).passthrough()),
    retiredItems: z.array(z.object({ item: taskView }).passthrough()),
  }).passthrough(),
}).passthrough();

const updateRun = (args: JsonRecord) => callTool("update_run", { runId: "run-1", expectedRevision: 3, taskId: "task-1", ...args });

const savedTask = () => taskIn(storedSectionsIn(firstOf(dbMocks.updateChain.set.mock.calls)[0].items), 0, 0);

describe("personal run MCP handler and a task's form", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("refuses to complete a task whose form has an empty required field, naming the field, and saves nothing", async () => {
    aRunWithTask([formBlock([requiredName(), { id: "field_email", label: "Email", kind: "email", required: false, answer: "nope" }])]);

    const body = await updateRun({ operation: "set_task_completed", completed: true });

    expectAToolError(body, {
      error: "form_incomplete",
      details: {
        fieldCount: 2,
        fields: [
          { taskId: "task-1", fieldId: "field_name", reason: "required" },
          { taskId: "task-1", fieldId: "field_email", reason: "invalid" },
        ],
      },
    });
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  });

  it("completes a task whose form is filled in, and reopens one whatever its form holds", async () => {
    aRunWithTask([formBlock([requiredName("Acme")])]);
    await updateRun({ operation: "set_task_completed", completed: true });
    expect(savedTask().isCompleted).toBe(true);

    resetAgentMcpHandlerMocks();
    aRunWithTask([formBlock([requiredName()])], true);
    await updateRun({ operation: "set_task_completed", completed: false });
    expect(savedTask().isCompleted).toBe(false);
  });

  it("does not complete the task when its last subtask is ticked while its form blocks it", async () => {
    aRunWithTask([subTasks(false), formBlock([requiredName()])]);

    await updateRun({ operation: "set_subtask_completed", subtaskId: "sub-2", completed: true });

    expect(savedTask().isCompleted).toBe(false);
  });

  it("shows get_run each form field with its answer, and no fields on other blocks, live or retired", async () => {
    const answered = requiredName("Acme");
    const contents = [{ id: "c-text", type: "text", value: "Steps", fields: [requiredName("stray")] }, formBlock([answered])];
    dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
      items: JSON.stringify([{ id: "section-1", title: "Kickoff", items: [{ id: "task-1", title: "Brief", contents }] }]),
      retired_items: JSON.stringify([{ kind: "item", sectionId: "section-1", item: { id: "task-old", title: "Old", contents } }]),
    })]);

    const body = await callTool("get_run", { runId: "run-1" });
    const run = runView.parse(body.result.structuredContent).run;

    for (const task of [taskIn(run.sections, 0, 0), firstOf(run.retiredItems).item]) {
      expect(task.contents).toEqual([{ id: "c-text", type: "text", value: "Steps" }, formBlock([answered])]);
    }
  });

  it("lets an agent define a form in create_template, as the tool's JSON Schema and its parser both accept", () => {
    const args = {
      title: "Client intake",
      sections: [{ title: "Kickoff", items: [{ title: "Collect the brief", contents: [{ type: "form", fields: [
        { label: "Client name", kind: "text", required: true, description: "As on the contract" },
        { label: "Plan", kind: "select", options: [{ label: "Basic" }, { label: "Pro" }] },
        { label: "Seats", kind: "number", min: 1, max: 50 },
      ] }] }] }],
    };
    const createTemplate = present(templateToolDefinitions.find((tool) => tool.name === "create_template"), "create_template");

    expect(new Ajv({ strict: false }).validate(createTemplate.inputSchema, args)).toBe(true);
    const parsed = createTemplateArgs.parse(args);
    const form = contentAt(taskIn(parsed.sections, 0, 0), 0);
    expect(form.type === "form" ? form.fields : []).toEqual(args.sections[0]?.items[0]?.contents[0]?.fields);
  });

  it("completes the task when its last subtask is ticked and its form is filled in", async () => {
    aRunWithTask([subTasks(false), formBlock([requiredName("Acme")])]);

    await updateRun({ operation: "set_subtask_completed", subtaskId: "sub-2", completed: true });

    expect(savedTask().isCompleted).toBe(true);
  });
});
