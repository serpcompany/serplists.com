import { z } from "zod";

// Tool argument validators and the tool list advertised by the personal run MCP endpoint
// (functions/api/handlers/agentMcp.ts).

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
  {
    name: "list_templates",
    description: "List the authenticated user's active personal SOP templates, most recently edited or created "
      + "first, up to 100 (truncated is true when there are more). Templates are read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
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
    description: "List the authenticated user's active personal checklist runs.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["in_progress", "completed"] } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_run",
    description: "Read a personal run, including its sections, tasks, subtasks, progress, status, and revision. "
      + "Pass sectionId or taskId to read part of a large run. A run too large to return at once fails with "
      + "result_too_large and lists its section and task ids.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        sectionId: { type: "string", description: "Return only this section." },
        taskId: { type: "string", description: "Return only this task, inside its section." },
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
      + "set_run_status needs status. Leave out fields the operation does not use. "
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
        status: { type: "string", enum: ["in_progress", "completed"], description: "Required for set_run_status." },
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
