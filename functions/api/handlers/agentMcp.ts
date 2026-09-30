import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { buildAuditEventValues } from "../utils/audit";
import { getEntitlementsForUser } from "../utils/entitlements";
import { log } from "../utils/logger";
import { failedAuthIsBlocked, limitPersonalRunKey, recordFailedAuth } from "../utils/mcp-limits";
import {
  authenticatePersonalRunKey,
  markPersonalRunKeyUsed,
  type PersonalRunKeyIdentity,
} from "../utils/personal-run-key";
import { isRecord, parseStoredSections, ToolError, type JsonRecord } from "../utils/mcp-tools";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { calculateRunProgress } from "../utils/template-reconciliation";
import {
  createTemplate,
  getOwnedTemplate,
  getTemplate,
  templateToolDefinitions,
  updateTemplate,
} from "./agentMcpTemplates";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_LIST_RESULTS = 100;

type JsonRpcId = string | number | null;

const isValidRequestId = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));

const listRunsArgs = z.object({
  status: z.enum(["in_progress", "completed"]).optional(),
}).strict();

const startRunArgs = z.object({
  templateId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160).optional(),
}).strict();

const getRunArgs = z.object({
  runId: z.string().trim().min(1),
}).strict();

const initializeArgs = z.object({
  protocolVersion: z.string().trim().min(1),
  capabilities: z.record(z.unknown()),
  clientInfo: z.object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }).passthrough(),
}).passthrough();

const updateRunArgs = z.discriminatedUnion("operation", [
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
    notes: z.string().max(20_000),
  }).strict(),
  z.object({
    runId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    operation: z.literal("set_run_status"),
    status: z.enum(["in_progress", "completed"]),
  }).strict(),
]);

const toolDefinitions = [
  {
    name: "list_templates",
    description: "List the authenticated user's active personal SOP templates.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ...templateToolDefinitions,
  {
    name: "start_run",
    description: "Start a personal checklist run from one of the authenticated user's templates.",
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
    description: "Read a personal run, including its sections, tasks, subtasks, progress, status, and revision.",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "update_run",
    description: "Update one explicit part of a personal run. Pass the latest expectedRevision to prevent lost updates.",
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
            notes: { type: "string", maxLength: 20_000 },
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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown, status = 200): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }, status);
}

function toolResult(id: JsonRpcId, structuredContent: JsonRecord, text: string, isError = false): Response {
  const textContent = `${text}\n\n${JSON.stringify(structuredContent)}`;
  return rpcResult(id, {
    content: [{ type: "text", text: textContent }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  });
}

function boundedText(value: unknown, maximum = 160): string {
  const text = typeof value === "string" ? value : "Untitled";
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function assertBoundedResult(value: JsonRecord): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_RESULT_BYTES) {
    throw new ToolError("Result is too large; request a smaller resource", "result_too_large");
  }
}

function contentTypeIsJson(request: Request): boolean {
  return request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function acceptsMcpResponse(request: Request): boolean {
  const accept = request.headers.get("Accept");
  if (!accept) return false;
  const values = accept.toLowerCase().split(",").map((value) => value.trim().split(";", 1)[0]);
  return values.includes("application/json") && values.includes("text/event-stream");
}

function configuredOrigins(env: Env): Set<string> {
  const origins = new Set<string>();
  for (const value of [env.FRONTEND_URL, ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]) {
    if (!value?.trim()) continue;
    try {
      origins.add(new URL(value.trim()).origin);
    } catch {
      // Invalid configuration never broadens access.
    }
  }
  return origins;
}

function requestOriginIsAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    const normalized = new URL(origin).origin;
    return normalized === new URL(request.url).origin || configuredOrigins(env).has(normalized);
  } catch {
    return false;
  }
}

function requestHostIsSafe(request: Request, env: Env): boolean {
  const host = request.headers.get("Host");
  const requestUrl = new URL(request.url);
  if (host && host.toLowerCase() !== requestUrl.host.toLowerCase()) return false;

  if (
    requestUrl.hostname === "localhost"
    || requestUrl.hostname === "127.0.0.1"
    || requestUrl.hostname === "[::1]"
  ) {
    return true;
  }

  const allowedHosts = new Set(
    Array.from(configuredOrigins(env), (origin) => new URL(origin).host.toLowerCase()),
  );
  if (allowedHosts.size > 0) return allowedHosts.has(requestUrl.host.toLowerCase());
  return false;
}

function resetCompletionState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resetCompletionState);
  if (!isRecord(value)) return value;

  const next: JsonRecord = { ...value };
  if (Object.prototype.hasOwnProperty.call(next, "isCompleted")) next.isCompleted = false;
  if (Array.isArray(next.items)) next.items = next.items.map(resetCompletionState);
  if (Array.isArray(next.subItems)) next.subItems = next.subItems.map(resetCompletionState);
  if (Array.isArray(next.contents)) next.contents = next.contents.map(resetCompletionState);
  return next;
}

function summarizeTemplate(template: JsonRecord): JsonRecord {
  return {
    id: template.id,
    title: template.title,
    description: typeof template.description === "string"
      ? boundedText(template.description, 500)
      : template.description,
    type: template.type,
    contentVersion: template.content_version,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function serializeRun(run: JsonRecord): JsonRecord {
  return {
    id: run.id,
    templateId: run.template_id,
    title: run.title,
    sections: parseStoredSections(run.items),
    status: run.status ?? "in_progress",
    progress: typeof run.progress === "number" ? run.progress : 0,
    revision: typeof run.revision === "number" ? run.revision : 1,
    templateVersion: typeof run.template_version === "number" ? run.template_version : 1,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

function summarizeRun(run: JsonRecord): JsonRecord {
  const serialized = serializeRun(run);
  delete serialized.sections;
  return serialized;
}

function getSubtasks(task: JsonRecord): JsonRecord[] {
  const direct = Array.isArray(task.subItems) ? task.subItems.filter(isRecord) : [];
  const nested = Array.isArray(task.contents)
    ? task.contents.filter(isRecord).flatMap((content) =>
        Array.isArray(content.subItems) ? content.subItems.filter(isRecord) : [])
    : [];
  return [...direct, ...nested];
}

function findTask(sections: JsonRecord[], taskId: string): JsonRecord | null {
  for (const section of sections) {
    if (!Array.isArray(section.items)) continue;
    const task = section.items.find((item) => isRecord(item) && item.id === taskId);
    if (isRecord(task)) return task;
  }
  return null;
}

function applyRunOperation(
  sections: JsonRecord[],
  operation: z.infer<typeof updateRunArgs>,
): void {
  if (operation.operation === "set_run_status") return;

  const task = findTask(sections, operation.taskId);
  if (!task) throw new ToolError("Task not found", "task_not_found");

  if (operation.operation === "set_task_notes") {
    task.notes = operation.notes;
    return;
  }

  const subtasks = getSubtasks(task);
  if (operation.operation === "set_task_completed") {
    task.isCompleted = operation.completed;
    for (const subtask of subtasks) subtask.isCompleted = operation.completed;
    return;
  }

  const subtask = subtasks.find((candidate) => candidate.id === operation.subtaskId);
  if (!subtask) throw new ToolError("Subtask not found", "subtask_not_found");
  subtask.isCompleted = operation.completed;
  task.isCompleted = subtasks.length > 0 && subtasks.every((candidate) => candidate.isCompleted === true);
}

async function listTemplates(env: Env, identity: PersonalRunKeyIdentity): Promise<JsonRecord> {
  const db = createDb(env);
  const rows = await db
    .select()
    .from(schema.templates)
    .where(and(
      eq(schema.templates.user_id, identity.userId),
      eq(schema.templates.owner_type, "user"),
      isNull(schema.templates.team_id),
      isNull(schema.templates.deleted_at),
    ))
    .orderBy(desc(schema.templates.updated_at), desc(schema.templates.created_at));

  return {
    templates: rows
      .filter((row) => row.user_id === identity.userId
        && row.owner_type === "user"
        && row.team_id === null
        && row.deleted_at === null)
      .slice(0, MAX_LIST_RESULTS)
      .map((row) => summarizeTemplate(row as unknown as JsonRecord)),
    truncated: rows.length > MAX_LIST_RESULTS,
  };
}

async function startRun(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = startRunArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");

  const db = createDb(env);
  const template = await getOwnedTemplate(env, identity.userId, parsed.data.templateId);

  const entitlements = await getEntitlementsForUser(env, identity.userId);
  if (entitlements.plan === "free" && entitlements.limits.maxActiveRuns) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.checklist_runs)
      .where(and(
        eq(schema.checklist_runs.user_id, identity.userId),
        isNull(schema.checklist_runs.team_id),
        eq(schema.checklist_runs.status, "in_progress"),
        isNull(schema.checklist_runs.deleted_at),
      ))
      .limit(1);
    const currentCount = countRow?.count ?? 0;
    if (currentCount >= entitlements.limits.maxActiveRuns) {
      throw new ToolError("Active run limit reached", "limit_reached", {
        limit: entitlements.limits.maxActiveRuns,
        current: currentCount,
      });
    }
  }

  const normalized = normalizeSectionsPayload(parseJsonArray(template.items) ?? []);
  if (normalized.error) throw new ToolError("Template content is invalid", "invalid_template");

  const now = new Date().toISOString();
  const run = {
    id: crypto.randomUUID(),
    user_id: identity.userId,
    team_id: null,
    template_id: template.id,
    title: parsed.data.title ?? template.title,
    items: JSON.stringify(resetCompletionState(normalized.sections)),
    status: "in_progress",
    progress: 0,
    started_at: now,
    completed_at: null,
    created_by_user_id: identity.userId,
    started_by_user_id: identity.userId,
    created_at: now,
    updated_at: now,
    template_version: typeof template.content_version === "number" ? template.content_version : 1,
    revision: 1,
    retired_items: "[]",
  };
  const auditEvent = await buildAuditEventValues({
    actorUserId: identity.userId,
    subject: { type: "user", id: identity.userId },
    resource: { type: "checklist_run", id: run.id },
    action: "checklist_run.created",
    after: run,
    metadata: { source: "mcp", personalRunKeyId: identity.keyId, personalRunKeyName: identity.name },
    request,
    createdAt: now,
  });
  await db.batch([
    db.insert(schema.checklist_runs).values(run),
    db.insert(schema.audit_events).values(auditEvent),
  ]);

  return { run: serializeRun(run) };
}

async function listRuns(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = listRunsArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");

  const filters = [
    eq(schema.checklist_runs.user_id, identity.userId),
    isNull(schema.checklist_runs.team_id),
    isNull(schema.checklist_runs.deleted_at),
  ];
  if (parsed.data.status) filters.push(eq(schema.checklist_runs.status, parsed.data.status));

  const rows = await createDb(env)
    .select()
    .from(schema.checklist_runs)
    .where(and(...filters))
    .orderBy(desc(schema.checklist_runs.created_at));
  return {
    runs: rows
      .filter((row) => row.user_id === identity.userId && row.team_id === null && row.deleted_at === null)
      .slice(0, MAX_LIST_RESULTS)
      .map((row) => summarizeRun(row as unknown as JsonRecord)),
    truncated: rows.length > MAX_LIST_RESULTS,
  };
}

async function getOwnedRun(env: Env, userId: string, runId: string): Promise<JsonRecord> {
  const [run] = await createDb(env)
    .select()
    .from(schema.checklist_runs)
    .where(and(
      eq(schema.checklist_runs.id, runId),
      eq(schema.checklist_runs.user_id, userId),
      isNull(schema.checklist_runs.team_id),
      isNull(schema.checklist_runs.deleted_at),
    ))
    .limit(1);
  if (!run || run.user_id !== userId || run.team_id !== null || run.deleted_at !== null) {
    throw new ToolError("Run not found", "run_not_found");
  }
  return run as unknown as JsonRecord;
}

async function getRun(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = getRunArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");
  return { run: serializeRun(await getOwnedRun(env, identity.userId, parsed.data.runId)) };
}

function batchChanges(result: unknown): number | null {
  if (!isRecord(result) || !isRecord(result.meta)) return null;
  return typeof result.meta.changes === "number" ? result.meta.changes : null;
}

function runRevisionExistsSql(runId: string, userId: string, revision: number) {
  const { checklist_runs } = schema;
  return sql`exists (
    select 1 from ${checklist_runs}
    where ${checklist_runs.id} = ${runId}
      and ${checklist_runs.user_id} = ${userId}
      and ${checklist_runs.team_id} is null
      and ${checklist_runs.revision} = ${revision}
      and ${checklist_runs.deleted_at} is null
  )`;
}

function insertAuditWhenRunRevisionMatches(
  db: ReturnType<typeof createDb>,
  auditEvent: typeof schema.audit_events.$inferInsert,
  runId: string,
  userId: string,
  revision: number,
) {
  const { audit_events } = schema;
  return db.insert(audit_events).select(sql`
    select
      ${auditEvent.id},
      ${auditEvent.actor_user_id},
      ${auditEvent.subject_type},
      ${auditEvent.subject_id},
      ${auditEvent.resource_type},
      ${auditEvent.resource_id},
      ${auditEvent.action},
      ${auditEvent.before_json},
      ${auditEvent.after_json},
      ${auditEvent.diff_json},
      ${auditEvent.metadata_json},
      ${auditEvent.request_id},
      ${auditEvent.ip_hash},
      ${auditEvent.user_agent},
      ${auditEvent.created_at}
    where ${runRevisionExistsSql(runId, userId, revision)}
  `);
}

async function updateRun(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = updateRunArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");

  const existing = await getOwnedRun(env, identity.userId, parsed.data.runId);
  const currentRevision = typeof existing.revision === "number" ? existing.revision : 1;
  if (parsed.data.expectedRevision !== currentRevision) {
    throw new ToolError("Run changed since it was loaded; fetch it again before updating", "edit_conflict", {
      expectedRevision: parsed.data.expectedRevision,
      currentRevision,
    });
  }

  const sections = parseStoredSections(existing.items);
  applyRunOperation(sections, parsed.data);
  const now = new Date().toISOString();
  const updates: JsonRecord = {
    items: JSON.stringify(sections),
    progress: calculateRunProgress(sections),
    revision: currentRevision + 1,
    updated_at: now,
  };

  if (parsed.data.operation === "set_run_status") {
    updates.status = parsed.data.status;
    // Match the existing checklist status endpoint: a status-only transition does
    // not rewrite progress, and reopening does not erase completion attribution.
    updates.progress = typeof existing.progress === "number" ? existing.progress : 0;
    if (parsed.data.status === "completed") {
      updates.completed_at = now;
      updates.completed_by_user_id = identity.userId;
    }
  }

  const nextRun = { ...existing, ...updates };
  const auditEvent = await buildAuditEventValues({
    actorUserId: identity.userId,
    subject: { type: "user", id: identity.userId },
    resource: { type: "checklist_run", id: parsed.data.runId },
    action: "checklist_run.updated",
    before: existing,
    after: nextRun,
    diff: updates,
    metadata: {
      source: "mcp",
      operation: parsed.data.operation,
      personalRunKeyId: identity.keyId,
      personalRunKeyName: identity.name,
    },
    request,
    createdAt: now,
  });
  const db = createDb(env);
  const batchResults = await db.batch([
    insertAuditWhenRunRevisionMatches(
      db,
      auditEvent,
      parsed.data.runId,
      identity.userId,
      currentRevision,
    ),
    db.update(schema.checklist_runs)
      .set(updates)
      .where(and(
        eq(schema.checklist_runs.id, parsed.data.runId),
        eq(schema.checklist_runs.user_id, identity.userId),
        isNull(schema.checklist_runs.team_id),
        eq(schema.checklist_runs.revision, currentRevision),
        isNull(schema.checklist_runs.deleted_at),
        sql`exists (select 1 from ${schema.audit_events} where ${schema.audit_events.id} = ${auditEvent.id})`,
      )),
  ]);
  const auditChanges = batchChanges(batchResults[0]);
  const updateChanges = batchChanges(batchResults[1]);
  if (auditChanges === 0 && updateChanges === 0) {
    throw new ToolError("Run changed while it was being updated; fetch it again", "edit_conflict");
  }
  if (auditChanges !== 1 || updateChanges !== 1) {
    throw new ToolError("Unable to update the run safely", "internal_invariant");
  }

  return { run: serializeRun(nextRun) };
}

async function callTool(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  name: string,
  rawArguments: unknown,
): Promise<{ data: JsonRecord; text: string }> {
  switch (name) {
    case "list_templates": {
      const data = await listTemplates(env, identity);
      return { data, text: `Found ${(data.templates as unknown[]).length} personal template(s).` };
    }
    case "get_template": {
      const data = await getTemplate(env, identity, rawArguments);
      return { data, text: `Loaded template "${boundedText((data.template as JsonRecord).title)}".` };
    }
    case "create_template": {
      const data = await createTemplate(request, env, identity, rawArguments);
      return { data, text: `Created template "${boundedText((data.template as JsonRecord).title)}".` };
    }
    case "update_template": {
      const data = await updateTemplate(request, env, identity, rawArguments);
      return { data, text: `Updated template "${boundedText((data.template as JsonRecord).title)}".` };
    }
    case "start_run": {
      const data = await startRun(request, env, identity, rawArguments);
      return { data, text: `Started run "${boundedText((data.run as JsonRecord).title)}".` };
    }
    case "list_runs": {
      const data = await listRuns(env, identity, rawArguments);
      return { data, text: `Found ${(data.runs as unknown[]).length} personal run(s).` };
    }
    case "get_run": {
      const data = await getRun(env, identity, rawArguments);
      return { data, text: `Loaded run "${boundedText((data.run as JsonRecord).title)}".` };
    }
    case "update_run": {
      const data = await updateRun(request, env, identity, rawArguments);
      return { data, text: `Updated run "${boundedText((data.run as JsonRecord).title)}".` };
    }
    default:
      throw new ToolError(`Unknown tool: ${name}`, "tool_not_found");
  }
}

export async function handleAgentMcp(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  if (!contentTypeIsJson(request)) {
    return rpcError(null, -32600, "Content-Type must be application/json", undefined, 415);
  }
  if (!acceptsMcpResponse(request)) {
    return rpcError(null, -32600, "Accept must include application/json and text/event-stream", undefined, 406);
  }
  if (!requestHostIsSafe(request, env)) {
    return rpcError(null, -32600, "Invalid Host", undefined, 403);
  }
  if (!requestOriginIsAllowed(request, env)) {
    return rpcError(null, -32600, "Origin is not allowed", undefined, 403);
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) {
      return rpcError(null, -32600, "Invalid Content-Length", undefined, 400);
    }
    if (length > MAX_REQUEST_BYTES) {
      return rpcError(null, -32600, "Request body is too large", undefined, 413);
    }
  }

  if (failedAuthIsBlocked(request)) {
    return rpcError(null, -32000, "Too many failed authentication attempts", undefined, 429);
  }

  let identity: PersonalRunKeyIdentity | null;
  try {
    identity = await authenticatePersonalRunKey(request, env);
  } catch {
    return rpcError(null, -32603, "Internal error", undefined, 500);
  }
  if (!identity) {
    recordFailedAuth(request);
    return rpcError(null, -32001, "Unauthorized", undefined, 401);
  }

  // The router sets X-Request-Id. Logging the key ID for every authenticated request, even
  // malformed ones, lets an abused key be found and revoked.
  const requestId = request.headers.get("X-Request-Id") ?? undefined;
  log("info", "mcp_request", { requestId, keyId: identity.keyId });
  const rateLimitResult = limitPersonalRunKey(identity);
  if (!rateLimitResult.allowed) {
    log("warn", "mcp_rate_limited", { requestId, keyId: identity.keyId });
    const response = rpcError(null, -32000, "Rate limit exceeded", undefined, 429);
    response.headers.set("Retry-After", String(rateLimitResult.retryAfter));
    return response;
  }

  let payload: unknown;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REQUEST_BYTES) {
      return rpcError(null, -32600, "Request body is too large", undefined, 413);
    }
    // Workers types require both options; ignoreBOM: false is the spec default.
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return rpcError(isRecord(payload) && isValidRequestId(payload.id) ? payload.id : null, -32600, "Invalid Request");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "id")) {
    if (!isValidRequestId(payload.id)) return rpcError(null, -32600, "Invalid Request");
  }

  const id: JsonRpcId = isValidRequestId(payload.id) ? payload.id : null;

  const protocolVersion = request.headers.get("MCP-Protocol-Version");
  if (payload.method !== "initialize" && protocolVersion !== MCP_PROTOCOL_VERSION) {
    if (!Object.prototype.hasOwnProperty.call(payload, "id")) return new Response(null, { status: 202 });
    return rpcError(id, -32600, "Unsupported or missing MCP-Protocol-Version", {
      supported: [MCP_PROTOCOL_VERSION],
    }, 400);
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "id")) {
    return new Response(null, { status: 202 });
  }

  if (payload.method === "initialize") {
    const initialize = initializeArgs.safeParse(payload.params);
    if (!initialize.success) {
      return rpcError(id, -32602, initialize.error.issues[0]?.message ?? "Invalid initialize parameters");
    }
    return rpcResult(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "serp-lists-personal-runs", version: "0.2.0" },
    });
  }

  if (payload.method === "ping") return rpcResult(id, {});

  if (payload.method === "tools/list") {
    return rpcResult(id, { tools: toolDefinitions });
  }

  if (payload.method === "tools/call") {
    const params = isRecord(payload.params) ? payload.params : {};
    if (typeof params.name !== "string") return rpcError(id, -32602, "Tool name is required");
    log("info", "mcp_tool_call", { requestId, keyId: identity.keyId, toolName: boundedText(params.name, 64) });
    try {
      const { data, text } = await callTool(request, env, identity, params.name, params.arguments);
      assertBoundedResult(data);
      try {
        await markPersonalRunKeyUsed(env, identity);
      } catch {
        // Usage telemetry must not turn a committed tool mutation into a retryable failure.
      }
      return toolResult(id, data, text);
    } catch (error) {
      if (error instanceof ToolError) {
        if (error.code === "invalid_arguments" || error.code === "tool_not_found") {
          return rpcError(id, -32602, error.message, {
            code: error.code,
            ...(error.details ? { details: error.details } : {}),
          });
        }
        return toolResult(id, {
          error: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        }, error.message, true);
      }
      return rpcError(id, -32603, "Internal error");
    }
  }

  return rpcError(id, -32601, "Method not found");
}
