import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { firstOf, present, taskIn } from "../../../support/elements";
import { jsonRecordIn, storedSections, storedSectionsIn } from "../../../support/storedJson";
import {
  callTool,
  dbMocks,
  expectAToolError,
  personalRun,
  resetAgentMcpHandlerMocks,
  rpcErrorBody,
  sectionsOfAtLeast,
  sendTool,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { getTaskFormFields } from "@/lib/schemas/storedSections";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES } from "@/lib/schemas/contentLimits";
import { buildAuditEventValues } from "@functions/api/utils/audit";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { objectContaining } from "../../../support/asymmetricMatchers";

const OPTIONS = [{ id: "opt-basic", label: "Basic" }, { id: "opt-pro", label: "Pro" }];
const UPLOADED_FILE = { url: "https://serplists.com/api/uploads/file?key=briefs%2Fbrief.pdf", fileName: "brief.pdf", fileSize: 2048 };

const KINDS: Record<string, JsonRecord> = {
  text: { kind: "text" },
  longText: { kind: "longText" },
  url: { kind: "url" },
  email: { kind: "email" },
  number: { kind: "number", min: 1, max: 50 },
  date: { kind: "date" },
  select: { kind: "select", options: OPTIONS },
  multiSelect: { kind: "multiSelect", options: OPTIONS },
  checkbox: { kind: "checkbox" },
  file: { kind: "file" },
};

const STORED_ANSWERS: Record<string, unknown> = {
  text: "Acme",
  longText: "A brief\nover two lines",
  url: "https://acme.test/brief",
  email: "ops@acme.test",
  number: 12,
  date: "2026-10-06",
  select: "opt-pro",
  multiSelect: ["opt-basic"],
  checkbox: true,
  file: UPLOADED_FILE,
};

const fieldOf = (kind: string, extra: JsonRecord = {}): JsonRecord => ({
  id: `field-${kind}`,
  label: `The ${kind}`,
  required: true,
  ...KINDS[kind],
  ...extra,
});

const everyField = () => Object.keys(KINDS).map((kind) => fieldOf(kind));
const everyFieldAnswered = () => Object.keys(KINDS).map((kind) => fieldOf(kind, { answer: STORED_ANSWERS[kind] }));

const sectionsWithAForm = (fields: JsonRecord[], isCompleted: boolean) => [{
  id: "section-1",
  title: "Kickoff",
  items: [{ id: "task-1", title: "Brief", isCompleted, contents: [{ id: "c-form", type: "form", value: "", fields }] }],
}];

function aRunWithAForm({ fields = everyField(), isCompleted = false, status = "in_progress", revision = 3 }: {
  fields?: JsonRecord[];
  isCompleted?: boolean;
  status?: string;
  revision?: number;
} = {}) {
  dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({
    items: JSON.stringify(sectionsWithAForm(fields, isCompleted)),
    status,
    revision,
  })]);
}

const formAnswerCall = (fieldId: string, answer: unknown, expectedRevision = 3) =>
  ({ runId: "run-1", expectedRevision, operation: "set_form_answer", taskId: "task-1", fieldId, answer });

const setAnswer = (fieldId: string, answer: unknown, expectedRevision = 3) =>
  callTool("update_run", formAnswerCall(fieldId, answer, expectedRevision));

const savedTask = () => taskIn(storedSectionsIn(firstOf(dbMocks.updateChain.set.mock.calls)[0].items), 0, 0);
const savedField = (fieldId: string) => present(getTaskFormFields(savedTask()).find((field) => field.id === fieldId), fieldId);

const returnedTask = z.object({
  task: z.object({
    isCompleted: z.boolean(),
    contents: z.array(z.object({ fields: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough()),
  }).passthrough(),
}).passthrough();

function returnedField(body: Awaited<ReturnType<typeof callTool>>, fieldId: string) {
  const { task } = returnedTask.parse(body.result.structuredContent);
  return present(firstOf(task.contents).fields.find((field) => field.id === fieldId), fieldId);
}

function expectNothingWritten() {
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
  expect(markPersonalRunKeyUsed).not.toHaveBeenCalled();
}

async function recordedAuditDiff() {
  const result = firstOf(vi.mocked(buildAuditEventValues).mock.results);
  if (result.type !== "return") throw new Error(`buildAuditEventValues did not return: ${result.type}`);
  const { diff_json: diffJson } = await result.value;
  return { text: diffJson ?? "", diff: jsonRecordIn(diffJson ?? "{}") };
}

describe("update_run set_form_answer", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it.each([
    ["text", "Acme"],
    ["longText", "A brief\nover two lines"],
    ["url", "https://acme.test/brief"],
    ["email", "ops@acme.test"],
    ["number", 12],
    ["date", "2026-10-06"],
    ["select", "opt-pro"],
    ["multiSelect", ["opt-basic", "opt-pro"]],
    ["checkbox", true],
  ])("sets a %s field's answer, returns the task with it, and leaves the task unticked", async (kind, answer) => {
    aRunWithAForm();

    const body = await setAnswer(`field-${kind}`, answer);

    expect(body.result.isError).toBeUndefined();
    expect(body.result.structuredContent).toEqual({
      run: objectContaining({ id: "run-1", revision: 4, progress: 0 }),
      sectionId: "section-1",
      taskId: "task-1",
      task: objectContaining({ id: "task-1", isCompleted: false }),
    });
    expect(returnedField(body, `field-${kind}`)).toEqual(objectContaining({ kind, answer }));
    expect(savedField(`field-${kind}`).answer).toEqual(answer);
    expect(savedTask().isCompleted).toBe(false);
  });

  it.each([
    ["text", ""],
    ["text", "   "],
    ["text", null],
    ["longText", ""],
    ["url", ""],
    ["email", ""],
    ["number", null],
    ["date", ""],
    ["select", ""],
    ["multiSelect", []],
    ["checkbox", false],
    ["checkbox", null],
    ["file", null],
  ])("clears a required %s field sent %j, and keeps the other answers", async (kind, answer) => {
    aRunWithAForm({ fields: everyFieldAnswered() });

    const body = await setAnswer(`field-${kind}`, answer);

    expect(body.result.isError).toBeUndefined();
    expect(savedField(`field-${kind}`)).not.toHaveProperty("answer");
    expect(returnedField(body, `field-${kind}`)).not.toHaveProperty("answer");
    const others = getTaskFormFields(savedTask()).filter((field) => field.id !== `field-${kind}`);
    expect(others.map((field) => field.answer)).toEqual(Object.keys(KINDS).filter((other) => other !== kind).map((other) => STORED_ANSWERS[other]));
  });

  const breaksTheRule = (kind: string, answer: unknown, message: string) =>
    ({ kind, answer, message, details: { taskId: "task-1", fieldId: `field-${kind}`, kind, reason: "invalid" } });
  const ofTheWrongType = (kind: string, answer: unknown, message: string) =>
    ({ kind, answer, message, details: { taskId: "task-1", fieldId: `field-${kind}`, kind } });

  it.each([
    breaksTheRule("text", "x".repeat(501), "Use 500 characters or fewer."),
    breaksTheRule("longText", "x".repeat(10_001), "Use 10,000 characters or fewer."),
    breaksTheRule("url", "ftp://acme.test/brief", "Enter a URL that starts with http:// or https://."),
    breaksTheRule("email", "ops at acme", "Enter an email address like name@example.com."),
    breaksTheRule("number", 51, "Enter a number from 1 to 50."),
    breaksTheRule("number", 0, "Enter a number from 1 to 50."),
    breaksTheRule("date", "2026-02-30", "Enter a real date."),
    breaksTheRule("date", "06/10/2026", "Enter a real date."),
    breaksTheRule("select", "opt-gold", "Choose from the listed options."),
    breaksTheRule("multiSelect", ["opt-pro", "opt-gold"], "Choose from the listed options."),
    ofTheWrongType("text", 5, "A Short text field takes a string, or null to clear it"),
    ofTheWrongType("number", "12", "A Number field takes a number, or null to clear it"),
    ofTheWrongType("number", "", "A Number field takes a number, or null to clear it"),
    ofTheWrongType("date", 20261006, "A Date field takes a YYYY-MM-DD string, or null to clear it"),
    ofTheWrongType("select", ["opt-pro"], "A Dropdown field takes an option id, or null to clear it"),
    ofTheWrongType("multiSelect", "opt-pro", "A Multiple choice field takes an array of option ids, or null to clear it"),
    ofTheWrongType("checkbox", "yes", "A Checkbox field takes true or false, or null to clear it"),
  ])("refuses a $kind answer with \"$message\", and writes nothing", async ({ kind, answer, message, details }) => {
    aRunWithAForm();

    const body = await setAnswer(`field-${kind}`, answer);

    expectAToolError(body, { error: "invalid_answer", message, details });
    expectNothingWritten();
  });

  it.each([UPLOADED_FILE.url, ""])("refuses setting a file answer (%j), since agents have no upload, and writes nothing", async (answer) => {
    aRunWithAForm();

    const body = await setAnswer("field-file", answer);

    expectAToolError(body, {
      error: "unsupported_field_kind",
      message: "A file field can only be cleared over MCP (answer null); upload the file in SERP Lists",
      details: { taskId: "task-1", fieldId: "field-file", kind: "file" },
    });
    expectNothingWritten();
  });

  it("refuses an answer that is no answer of any kind as invalid arguments, as the advertised schema does", async () => {
    for (const answer of [UPLOADED_FILE, [1, 2], undefined]) {
      aRunWithAForm();
      const body = await rpcErrorBody(await sendTool("update_run", formAnswerCall("field-file", answer)));

      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain("answer");
    }
    expectNothingWritten();
  });

  it("names a task or field the run does not hold", async () => {
    aRunWithAForm();
    expectAToolError(
      await callTool("update_run", { ...formAnswerCall("field-text", "Acme"), taskId: "task-missing" }),
      { error: "task_not_found", message: "Task not found" },
    );

    aRunWithAForm();
    expectAToolError(await setAnswer("field-missing", "Acme"), {
      error: "field_not_found",
      message: "Form field not found: the task's form has no field \"field-missing\" (fieldId)",
    });
    expectNothingWritten();
  });

  it("keeps a completed run's answers frozen, as ticks are", async () => {
    aRunWithAForm({ status: "completed", fields: everyFieldAnswered(), isCompleted: true });

    const body = await setAnswer("field-text", "Other");

    expectAToolError(body, {
      error: "run_completed",
      message: "Run is completed, so its tasks, subtasks, and form answers can no longer be changed; set_run_status in_progress reopens it",
    });
    expectNothingWritten();
  });

  it("refuses an expectedRevision the run has moved past with edit_conflict", async () => {
    aRunWithAForm({ revision: 5 });

    const body = await setAnswer("field-text", "Acme", 4);

    expectAToolError(body, { error: "edit_conflict", details: { expectedRevision: 4, currentRevision: 5 } });
    expectNothingWritten();
  });

  it("stores each chosen option once", async () => {
    aRunWithAForm();

    await setAnswer("field-multiSelect", ["opt-pro", "opt-basic", "opt-pro"]);

    expect(savedField("field-multiSelect").answer).toEqual(["opt-pro", "opt-basic"]);
  });

  describe("answering never ticks or unticks the task", () => {
    it("leaves a task unticked once its only required field is answered", async () => {
      aRunWithAForm({ fields: [fieldOf("text")] });

      await setAnswer("field-text", "Acme");

      expect(savedTask().isCompleted).toBe(false);
    });

    it("keeps a ticked task ticked when an answer changes and its form stays complete", async () => {
      aRunWithAForm({ fields: [fieldOf("text", { answer: "Acme" }), fieldOf("email", { required: false })], isCompleted: true });
      await setAnswer("field-text", "Acme Ltd");
      expect(savedTask().isCompleted).toBe(true);

      resetAgentMcpHandlerMocks();
      aRunWithAForm({ fields: [fieldOf("text", { answer: "Acme" }), fieldOf("email", { required: false, answer: "a@acme.test" })], isCompleted: true });
      await setAnswer("field-email", null);
      expect(savedTask().isCompleted).toBe(true);
    });

    it("refuses clearing a required answer of a ticked task with form_incomplete, as the run save does, and writes nothing", async () => {
      aRunWithAForm({ fields: [fieldOf("text", { answer: "Acme" })], isCompleted: true });

      const body = await setAnswer("field-text", "");

      expectAToolError(body, {
        error: "form_incomplete",
        message: "The task is done, and this answer would leave its form with a required field without an answer or an "
          + "answer that is not valid; untick it with set_task_completed first",
        details: { fieldCount: 1, fields: [{ taskId: "task-1", fieldId: "field-text", reason: "required" }] },
      });
      expectNothingWritten();
    });
  });

  describe("the audit diff", () => {
    it("lists the task in answersChanged with the field id, never the answer", async () => {
      aRunWithAForm();

      await setAnswer("field-text", "Confidential client name");

      const { diff, text } = await recordedAuditDiff();
      expect(diff).toEqual({
        operation: "set_form_answer",
        taskId: "task-1",
        fieldId: "field-text",
        answersChanged: ["task-1"],
        progress: { from: 0, to: 0 },
        revision: { from: 3, to: 4 },
      });
      expect(text).not.toContain("Confidential");
    });

    it("lists no answer change when the answer sent is the one stored", async () => {
      aRunWithAForm({ fields: everyFieldAnswered() });

      await setAnswer("field-multiSelect", ["opt-basic"]);

      const { diff } = await recordedAuditDiff();
      expect(diff).not.toHaveProperty("answersChanged");
      expect(diff).not.toHaveProperty("answer");
    });
  });

  describe("the run content limit", () => {
    function aRunOfContentBytes(targetBytes: number, longAnswer?: string) {
      const sections = storedSections.parse(sectionsOfAtLeast(RUN_CONTENT_MAX_BYTES - 32 * 1024));
      const task = taskIn(sections, 0, 0);
      task.contents = [{ id: "c-form", type: "form", value: "", fields: [
        fieldOf("text", { required: false }),
        fieldOf("longText", { required: false, ...(longAnswer === undefined ? {} : { answer: longAnswer }) }),
      ] }];
      const filler = taskIn(sections, 0, 1);
      filler.notes = `${String(filler.notes)}${"x".repeat(targetBytes - contentSaveBytes(sections))}`;
      expect(contentSaveBytes(sections)).toBe(targetBytes);
      dbMocks.selectChain.limit.mockResolvedValueOnce([personalRun({ items: JSON.stringify(sections), revision: 3 })]);
    }

    it("refuses an answer that would take the run past the limit, and takes one that fits", async () => {
      aRunOfContentBytes(RUN_CONTENT_MAX_BYTES - 5_000);
      expectAToolError(await setAnswer("field-longText", "x".repeat(10_000)), {
        error: "content_too_large",
        details: { limit: RUN_CONTENT_MAX_BYTES, size: RUN_CONTENT_MAX_BYTES - 5_000 + 10_000 + '"answer":"",'.length },
      });
      expectNothingWritten();

      aRunOfContentBytes(RUN_CONTENT_MAX_BYTES - 5_000);
      expect((await setAnswer("field-text", "Acme")).result.isError).toBeUndefined();
    });

    it("clears an answer of a run already over the limit", async () => {
      aRunOfContentBytes(RUN_CONTENT_MAX_BYTES + 1_000, "x".repeat(10_000));

      const body = await setAnswer("field-longText", null);

      expect(body.result.isError).toBeUndefined();
      expect(savedField("field-longText")).not.toHaveProperty("answer");
    });
  });
});
