import { beforeEach, describe, expect, it } from "vitest";
import { firstOf, taskIn } from "../../../support/elements";
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

  it("completes the task when its last subtask is ticked and its form is filled in", async () => {
    aRunWithTask([subTasks(false), formBlock([requiredName("Acme")])]);

    await updateRun({ operation: "set_subtask_completed", subtaskId: "sub-2", completed: true });

    expect(savedTask().isCompleted).toBe(true);
  });
});
