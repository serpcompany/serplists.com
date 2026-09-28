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

export function parseToolArguments<Schema extends z.ZodTypeAny>(schema: Schema, rawArguments: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");
  return parsed.data;
}

export const toolDefinitions = [
  {
    name: "list_templates",
    description: "List the authenticated user's active personal SOP templates. Templates are read-only.",
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
      + "Returns the run summary with its new revision and the changed task; call get_run for the full run.",
    inputSchema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            runId: { type: "string" },
            expectedRevision: { type: "integer", minimum: 1 },
            operation: { const: "set_task_completed" },
            taskId: { type: "string" },
            completed: { type: "boolean" },
          },
          required: ["runId", "expectedRevision", "operation", "taskId", "completed"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            runId: { type: "string" },
            expectedRevision: { type: "integer", minimum: 1 },
            operation: { const: "set_subtask_completed" },
            taskId: { type: "string" },
            subtaskId: { type: "string" },
            completed: { type: "boolean" },
          },
          required: ["runId", "expectedRevision", "operation", "taskId", "subtaskId", "completed"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            runId: { type: "string" },
            expectedRevision: { type: "integer", minimum: 1 },
            operation: { const: "set_task_notes" },
            taskId: { type: "string" },
            notes: { type: "string", maxLength: MAX_TASK_NOTES_LENGTH },
          },
          required: ["runId", "expectedRevision", "operation", "taskId", "notes"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            runId: { type: "string" },
            expectedRevision: { type: "integer", minimum: 1 },
            operation: { const: "set_run_status" },
            status: { type: "string", enum: ["in_progress", "completed"] },
          },
          required: ["runId", "expectedRevision", "operation", "status"],
          additionalProperties: false,
        },
      ],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
] as const;

export function isReadOnlyTool(name: string): boolean {
  return toolDefinitions.some((tool) => tool.name === name && tool.annotations.readOnlyHint);
}
