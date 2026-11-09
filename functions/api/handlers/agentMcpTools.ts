import { z } from "zod";
import { MAX_FORM_TEXT_ANSWER_LENGTH } from "../../../src/lib/schemas/formFields";
import { isRecord, type JsonRecord } from "../../../src/lib/schemas/jsonRecords";
import type { RunKeyPermission } from "../../../src/lib/schemas/runKeyPermissions";
import { cursorArg, cursorJsonSchema, templateToolDefinitions } from "./agentMcpTemplateTools";

export type SectionAndTaskIds = { sectionId?: string | undefined; taskId?: string | undefined };

export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: JsonRecord,
  ) {
    super(message);
  }
}

export const MAX_TASK_NOTES_LENGTH = 20_000;
export const MAX_TASK_NOTES_BYTES = 30 * 1024;

const formatNumber = (value: number) => value.toLocaleString("en-US");
const TASK_NOTES_LIMITS = `${formatNumber(MAX_TASK_NOTES_LENGTH)} characters and ${MAX_TASK_NOTES_BYTES / 1024}KB `
  + `(${formatNumber(MAX_TASK_NOTES_BYTES)} bytes of UTF-8)`;

const taskNotesArg = z.string().superRefine((notes, context) => {
  const bytes = new TextEncoder().encode(notes).byteLength;
  if (notes.length <= MAX_TASK_NOTES_LENGTH && bytes <= MAX_TASK_NOTES_BYTES) return;
  context.addIssue({
    code: "custom",
    message: `Too long: notes can be at most ${TASK_NOTES_LIMITS}; `
      + `these are ${formatNumber(notes.length)} characters and ${formatNumber(bytes)} bytes. Send shorter notes`,
  });
});

export const listRunsArgs = z.object({
  status: z.enum(["in_progress", "completed"]).optional(),
  cursor: cursorArg.optional(),
}).strict();

export const startRunArgs = z.object({
  templateId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160).optional(),
}).strict();

export const getRunArgs = z.object({
  runId: z.string().trim().min(1),
  sectionId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  retired: z.boolean().optional(),
  cursor: cursorArg.optional(),
}).strict();

const runAtRevision = z.object({
  runId: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
});

export const updateRunArgs = z.discriminatedUnion("operation", [
  runAtRevision.extend({
    operation: z.literal("set_task_completed"),
    taskId: z.string().trim().min(1),
    completed: z.boolean(),
  }).strict(),
  runAtRevision.extend({
    operation: z.literal("set_subtask_completed"),
    taskId: z.string().trim().min(1),
    subtaskId: z.string().trim().min(1),
    completed: z.boolean(),
  }).strict(),
  runAtRevision.extend({
    operation: z.literal("set_task_notes"),
    taskId: z.string().trim().min(1),
    notes: taskNotesArg,
  }).strict(),
  runAtRevision.extend({
    operation: z.literal("set_run_status"),
    status: z.enum(["in_progress", "completed"]),
  }).strict(),
  runAtRevision.extend({
    operation: z.literal("set_form_answer"),
    taskId: z.string().trim().min(1),
    fieldId: z.string().trim().min(1),
    answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable(),
  }).strict(),
]);

export type UpdateRunArgs = z.infer<typeof updateRunArgs>;
export type SetFormAnswerArgs = Extract<UpdateRunArgs, { operation: "set_form_answer" }>;

const MAX_REPORTED_ISSUES = 5;

type NullIsAValue = (args: JsonRecord, name: string) => boolean;

const nullIsNeverAValue: NullIsAValue = () => false;

function dropNullFields(rawArguments: unknown, nullIsAValue: NullIsAValue): unknown {
  if (!isRecord(rawArguments)) return rawArguments ?? {};
  return Object.fromEntries(Object.entries(rawArguments).filter(([name, value]) => value !== null || nullIsAValue(rawArguments, name)));
}

export function parseToolArguments<Arguments>(
  schema: z.ZodType<Arguments, z.ZodTypeDef, unknown>,
  rawArguments: unknown,
  nullIsAValue: NullIsAValue = nullIsNeverAValue,
): Arguments {
  const parsed = schema.safeParse(dropNullFields(rawArguments, nullIsAValue));
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const message = issues.map(({ path, message: text }) => (path ? `${path}: ${text}` : text)).join("; ");
  throw new ToolError(message || "Invalid arguments", "invalid_arguments", { issues });
}

const nullClearsAFormAnswer: NullIsAValue = (args, name) => name === "answer" && args["operation"] === "set_form_answer";

export const parseUpdateRunArguments = (rawArguments: unknown): UpdateRunArgs =>
  parseToolArguments(updateRunArgs, rawArguments, nullClearsAFormAnswer);

const TEXT_ANSWER_LIMITS = Object.entries(MAX_FORM_TEXT_ANSWER_LENGTH)
  .map(([kind, maxLength]) => `${kind} ${formatNumber(maxLength)}`)
  .join(", ");

export const toolDefinitions = [
  ...templateToolDefinitions,
  {
    name: "start_run",
    description: "Start a personal checklist run from one of the authenticated user's templates. Returns the "
      + "new run with its sections, tasks, and revision when it fits in one result (32KB); otherwise its fields "
      + "without sections (sectionsOmitted), to read with get_run. A template whose run would be too large to "
      + "save fails with content_too_large and nothing is created.",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        title: { type: "string", minLength: 1, maxLength: 160 },
      },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "list_runs",
    description: "List the authenticated user's active personal checklist runs, newest first: each run's id, "
      + "templateId, title, status, progress, revision, and dates, without sections (get_run reads those). No "
      + "result is larger than 32KB, so the list comes a page at a time (titles over 160 characters are cut). "
      + "While a result has nextCursor, call list_runs with cursor set to it for the next page; the cursor keeps "
      + "the status filter.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["in_progress", "completed"] },
        cursor: cursorJsonSchema,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_run",
    description: "Read a personal run: its sections, tasks, subtasks, completion, notes, progress, status, and "
      + "revision, and retiredItems (work a template change removed, read-only). A form block lists its fields, "
      + "each with its id, label, kind, required flag, and the run's answer when it has one. No result is larger than 32KB, "
      + "what MCP clients take from one call, so a larger run comes back as an outline instead (sectionsOmitted, "
      + "and outline: each section's id, title, taskCount, and bytes; run.retiredCount and run.retiredBytes say "
      + "how much retired work it holds). Read a section with sectionId, or one task with taskId. A section too "
      + "large for one result comes back a page of tasks at a time (section.firstTask and section.taskCount say "
      + "which), and anything too large for a result on its own, such as a task with very long notes, comes back "
      + "as part: pieces of its JSON text to join in order. Pass retired: true to read retiredItems instead, a "
      + "page of whole entries at a time (firstRetired and retiredCount say which); with sectionId or taskId it "
      + "reads only that section's or task's retired work. While a result has nextCursor, call get_run with runId "
      + "and cursor set to it for the rest. A cursor reads the revision it started from: once the run changes it "
      + "fails with edit_conflict, so start again without it.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        sectionId: {
          type: "string",
          description: "Read only this section, in pages if it is too large for one result; with retired, its retired work.",
        },
        taskId: { type: "string", description: "Read only this task; with retired, its retired work." },
        retired: { type: "boolean", description: "Read the run's retired work (retiredItems) instead of its sections." },
        cursor: cursorJsonSchema,
      },
      required: ["runId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "update_run",
    description: "Update one explicit part of a personal run. Pass the latest expectedRevision to prevent lost updates. "
      + "Each operation takes its own fields: set_task_completed needs taskId and completed; "
      + "set_subtask_completed needs taskId, subtaskId, and completed; set_task_notes needs taskId and notes, "
      + `which replace the task's notes and can be at most ${TASK_NOTES_LIMITS}, so they fit in one result `
      + "(get_run returns longer notes written in SERP Lists in parts); "
      + "set_task_completed with completed true fails with form_incomplete while the task's form has a required "
      + "field without an answer or an answer that is not valid (details.fields names each taskId and fieldId), and "
      + "ticking a task's last subtask completes the task only when its form is complete; "
      + "set_form_answer needs taskId, fieldId (a field of the task's form, from get_run), and answer, the field's "
      + "answer for its kind: a string for text, longText, url, and email, a YYYY-MM-DD string for date, a number "
      + "for number, an option id for select, an array of option ids for multiSelect, true or false for checkbox; "
      + "null clears any field, and '' (text kinds, date, select), [] (multiSelect), and false (checkbox) clear "
      + "the fields they fit, even a required one. A file field can only be cleared "
      + "(unsupported_field_kind: files are uploaded in SERP Lists). An answer of the wrong type, or one that breaks "
      + "the field's rule (an http(s) URL, an email address, a real date, a number within the field's min and max, "
      + `listed option ids, text within its kind's length: ${TEXT_ANSWER_LIMITS} characters), fails with invalid_answer and the `
      + "field's message. Answering never ticks or unticks the task, and on a ticked task an answer that leaves its "
      + "form incomplete fails with form_incomplete; "
      + "set_run_status needs status; a run can be completed only once every task and Sub-task is done "
      + "(it fails with run_incomplete, naming open taskIds, otherwise). A completed run's tasks, subtasks, and form "
      + "answers are frozen: set_task_completed, set_subtask_completed, and set_form_answer fail with run_completed "
      + "until set_run_status in_progress reopens it (on the Free plan a reopen counts toward the active-run limit "
      + "and can fail with limit_reached); notes stay editable. Leave out fields the operation does not use. "
      + "Returns the run's fields with its new revision and, after a task operation, the changed task (sectionId "
      + "and taskId name it) when it fits in one result (32KB); taskOmitted otherwise, so read it with get_run and "
      + "taskId.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        expectedRevision: {
          type: "integer",
          minimum: 1,
          description: "The run's current revision, from get_run, list_runs, start_run, or the previous update_run.",
        },
        operation: {
          type: "string",
          enum: ["set_task_completed", "set_subtask_completed", "set_task_notes", "set_run_status", "set_form_answer"],
        },
        taskId: {
          type: "string",
          description: "Required for set_task_completed, set_subtask_completed, set_task_notes, and set_form_answer.",
        },
        subtaskId: { type: "string", description: "Required for set_subtask_completed." },
        completed: { type: "boolean", description: "Required for set_task_completed and set_subtask_completed." },
        notes: {
          type: "string",
          maxLength: MAX_TASK_NOTES_LENGTH,
          description: `Required for set_task_notes. Replaces the task's notes: at most ${TASK_NOTES_LIMITS}.`,
        },
        status: {
          type: "string",
          enum: ["in_progress", "completed"],
          description: "Required for set_run_status. completed needs every task and Sub-task done.",
        },
        fieldId: { type: "string", description: "Required for set_form_answer: the id of a field in the task's form." },
        answer: {
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "array", items: { type: "string" } },
            { type: "null" },
          ],
          description: "Required for set_form_answer: the field's answer for its kind (a string, a number, an option id, "
            + "an array of option ids, or true or false), or null to clear it.",
        },
      },
      required: ["runId", "expectedRevision", "operation"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
] as const;

export function isReadOnlyTool(name: string): boolean {
  return toolDefinitions.some((tool) => tool.name === name && tool.annotations.readOnlyHint);
}

type ToolName = (typeof toolDefinitions)[number]["name"];

const toolPermissions: Record<ToolName, RunKeyPermission> = {
  list_templates: "templates:read",
  get_template: "templates:read",
  create_template: "templates:write",
  update_template: "templates:write",
  start_run: "runs:write",
  list_runs: "runs:read",
  get_run: "runs:read",
  update_run: "runs:write",
};

export function toolPermission(name: string): RunKeyPermission | undefined {
  const tool = toolDefinitions.find((definition) => definition.name === name);
  return tool ? toolPermissions[tool.name] : undefined;
}

export function keyAllowsTool(permissions: readonly RunKeyPermission[], name: string): boolean {
  const permission = toolPermission(name);
  return permission !== undefined && permissions.includes(permission);
}
