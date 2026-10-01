import { z } from "zod";
import type { RunKeyPermission } from "../../../src/lib/schemas/runKeyPermissions";
import { cursorArg, cursorJsonSchema, templateToolDefinitions } from "./agentMcpTemplateTools";

export type JsonRecord = Record<string, unknown>;

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

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

export const updateRunArgs = z.discriminatedUnion("operation", [
  z.object({
    runId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    operation: z.literal("set_task_completed"),
    taskId: z.string().trim().min(1),
    completed: z.boolean(),
  }).strict(),
  z.object({
    runId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    operation: z.literal("set_subtask_completed"),
    taskId: z.string().trim().min(1),
    subtaskId: z.string().trim().min(1),
    completed: z.boolean(),
  }).strict(),
  z.object({
    runId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    operation: z.literal("set_task_notes"),
    taskId: z.string().trim().min(1),
    notes: taskNotesArg,
  }).strict(),
  z.object({
    runId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    operation: z.literal("set_run_status"),
    status: z.enum(["in_progress", "completed"]),
  }).strict(),
]);

export type UpdateRunArgs = z.infer<typeof updateRunArgs>;

const MAX_REPORTED_ISSUES = 5;

function dropNullFields(rawArguments: unknown): unknown {
  if (!isRecord(rawArguments)) return rawArguments ?? {};
  return Object.fromEntries(Object.entries(rawArguments).filter(([, value]) => value !== null));
}

export function parseToolArguments<Arguments>(
  schema: z.ZodType<Arguments, z.ZodTypeDef, unknown>,
  rawArguments: unknown,
): Arguments {
  const parsed = schema.safeParse(dropNullFields(rawArguments));
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const message = issues.map(({ path, message: text }) => (path ? `${path}: ${text}` : text)).join("; ");
  throw new ToolError(message || "Invalid arguments", "invalid_arguments", { issues });
}

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
      + "revision, and retiredItems (work a template change removed, read-only). No result is larger than 32KB, "
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
      + "set_run_status needs status; a run can be completed only once every task and Sub-task is done "
      + "(it fails with run_incomplete, naming open taskIds, otherwise). Leave out fields the operation does not use. "
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
          enum: ["set_task_completed", "set_subtask_completed", "set_task_notes", "set_run_status"],
        },
        taskId: {
          type: "string",
          description: "Required for set_task_completed, set_subtask_completed, and set_task_notes.",
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
  return Object.prototype.hasOwnProperty.call(toolPermissions, name) ? toolPermissions[name as ToolName] : undefined;
}

export function keyAllowsTool(permissions: readonly RunKeyPermission[], name: string): boolean {
  const permission = toolPermission(name);
  return permission !== undefined && permissions.includes(permission);
}
