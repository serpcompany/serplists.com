import { z } from "zod";
import type { RunKeyPermission } from "../../../src/lib/schemas/runKeyPermissions";
import { cursorArg, cursorJsonSchema, templateToolDefinitions } from "./agentMcpTemplateTools";

// Tool argument validators, the tool list advertised by the personal run MCP endpoint
// (functions/api/handlers/agentMcp.ts), and the Run Key permission each tool needs.

export type JsonRecord = Record<string, unknown>;

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
    notes: z.string().max(MAX_TASK_NOTES_LENGTH),
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

// Models often send fields a call does not use as null (OpenAI strict mode does so for
// every optional field). Treat a null field as absent; every other value is validated.
function dropNullFields(rawArguments: unknown): unknown {
  if (!isRecord(rawArguments)) return rawArguments ?? {};
  return Object.fromEntries(Object.entries(rawArguments).filter(([, value]) => value !== null));
}

export function parseToolArguments<Schema extends z.ZodTypeAny>(schema: Schema, rawArguments: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(dropNullFields(rawArguments));
  if (parsed.success) return parsed.data;
  // Name the field in every message ("notes: Required") so an agent can correct its call.
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
    description: "Start a personal checklist run from one of the authenticated user's templates. "
      + "Returns the new run with its sections, tasks, and revision. A template too large to run "
      + "through MCP fails with content_too_large and nothing is created.",
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
    description: "Read a personal run, including its sections, tasks, subtasks, progress, status, and revision, "
      + "and retiredItems (work a template change removed). Pass sectionId or taskId to read part of a large run; "
      + "retiredItems then holds only that section's or task's retired work, and retired ids work too. A run too "
      + "large to return at once fails with result_too_large and lists its section, task, and retired ids.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        sectionId: { type: "string", description: "Return only this section, live or retired." },
        taskId: { type: "string", description: "Return only this task, inside its section, live or retired." },
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
      + "set_subtask_completed needs taskId, subtaskId, and completed; set_task_notes needs taskId and notes; "
      + "set_run_status needs status; a run can be completed only once every task and Sub-task is done "
      + "(it fails with run_incomplete, naming open taskIds, otherwise). Leave out fields the operation does not use. "
      + "Returns the run summary with its new revision and the changed task; call get_run for the full run.",
    // One flat object: model APIs reject a oneOf/anyOf/allOf at the root of a tool schema,
    // and many clients read only top-level properties. updateRunArgs enforces which
    // fields each operation needs.
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
          description: "Required for set_task_notes. Replaces the task's notes.",
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

// The Run Key permission each tool needs (src/lib/schemas/runKeyPermissions.ts).
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

/** The permission a tool needs; undefined for a name that is not a tool. */
export function toolPermission(name: string): RunKeyPermission | undefined {
  return Object.prototype.hasOwnProperty.call(toolPermissions, name) ? toolPermissions[name as ToolName] : undefined;
}

export function keyAllowsTool(permissions: readonly RunKeyPermission[], name: string): boolean {
  const permission = toolPermission(name);
  return permission !== undefined && permissions.includes(permission);
}
