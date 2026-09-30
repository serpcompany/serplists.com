import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import {
  checkActiveRunCapacity,
  countActiveRuns,
  isReopening,
  runInsertStatements,
  type RunOwnerContext,
} from "../utils/active-run-limit";
import { requestHostIsSafe, requestOriginIsAllowed } from "../utils/agent-mcp-host";
import { buildAuditEventValues } from "../utils/audit";
import { describeErrorForLog, log } from "../utils/logger";
import { failedAuthIsBlocked, limitPersonalRunKey, recordFailedAuth } from "../utils/mcp-limits";
import {
  authenticatePersonalRunKey,
  markPersonalRunKeyUsed,
  type PersonalRunKeyIdentity,
} from "../utils/personal-run-key";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { completionStamps } from "../utils/run-completion";
import { calculateRunProgress, resetRunCompletionState } from "../utils/template-reconciliation";
import { withStableTemplateIdentities } from "../utils/template-identities";
import { boundedText, toJson, utf8ByteLength } from "./agentMcpPages";
import {
  applyRunOperation,
  assertRunCanBeCompleted,
  assertRunContentFits,
  jsonByteLength,
  MAX_UNPAGED_RESULT_BYTES,
  outlineRetiredItems,
  outlineSections,
  parseRetiredItems,
  parseStoredSections,
  selectRunScope,
  serializeRun,
  summarizeRun,
  summarizeRunForAudit,
  updateRunAuditDiff,
  updateRunResult,
} from "./agentMcpRuns";
import { describeTemplateRead } from "./agentMcpTemplatePages";
import { createTemplate, getOwnedTemplate, getTemplate, updateTemplate } from "./agentMcpTemplates";
import {
  getRunArgs,
  isReadOnlyTool,
  isRecord,
  keyAllowsTool,
  listRunsArgs,
  parseToolArguments,
  startRunArgs,
  ToolError,
  toolDefinitions,
  toolPermission,
  updateRunArgs,
  type JsonRecord,
} from "./agentMcpTools";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_LIST_RESULTS = 100;

type JsonRpcId = string | number | null;

const isValidRequestId = (value: unknown): value is string | number =>
  typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value));

const initializeArgs = z.object({
  protocolVersion: z.string().trim().min(1),
  capabilities: z.record(z.unknown()),
  clientInfo: z.object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
  }).passthrough(),
}).passthrough();

// toJson replaces lone surrogates in every string, so stored text can never make a response
// that strict JSON parsers (Codex's serde_json) reject.
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(toJson(value), {
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
  const textContent = `${text}\n\n${toJson(structuredContent)}`;
  return rpcResult(id, {
    content: [{ type: "text", text: textContent }],
    structuredContent,
    ...(isError ? { isError: true } : {}),
  });
}

// Only for read-only tools. A mutation must never report failure after its write has
// committed, so mutating tools size their results before the write or keep them compact.
function assertBoundedResult(value: JsonRecord): void {
  if (jsonByteLength(value) > MAX_UNPAGED_RESULT_BYTES) {
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
    // A Template's updated_at stays NULL until its first edit, and SQLite sorts NULL
    // last, so order by last change (edit, else creation). The id makes ties stable.
    .orderBy(
      desc(sql`coalesce(${schema.templates.updated_at}, ${schema.templates.created_at})`),
      desc(schema.templates.id),
    );

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
  const args = parseToolArguments(startRunArgs, rawArguments);

  const db = createDb(env);
  const template = await getOwnedTemplate(env, identity.userId, args.templateId);

  const owner = { userId: identity.userId, teamId: null };
  // Fast path for a friendly error; the guarded insert below is what enforces the limit.
  const limit = await assertActiveRunCapacity(env, owner);

  const normalized = normalizeSectionsPayload(parseJsonArray(template.items) ?? []);
  if (normalized.error) throw new ToolError("Template content is invalid", "invalid_template");

  const now = new Date().toISOString();
  const run = {
    id: crypto.randomUUID(),
    user_id: identity.userId,
    team_id: null,
    template_id: template.id,
    title: args.title ?? template.title,
    items: JSON.stringify(resetRunCompletionState(sanitizeStoredSections(withStableTemplateIdentities(normalized.sections)))),
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
  // Size the run before writing: once the batch commits, start_run must return the run
  // rather than an error, or the agent retries and creates duplicate runs. The content
  // cap leaves room under MAX_UNPAGED_RESULT_BYTES for the run's scalar fields.
  assertRunContentFits(utf8ByteLength(run.items));
  const result = { run: serializeRun(run) };
  const auditEvent = await buildAuditEventValues({
    actorUserId: identity.userId,
    subject: { type: "user", id: identity.userId },
    resource: { type: "checklist_run", id: run.id },
    action: "checklist_run.created",
    after: summarizeRunForAudit(run),
    metadata: { source: "mcp", personalRunKeyId: identity.keyId, personalRunKeyName: identity.name },
    request,
    createdAt: now,
  });
  // Concurrent start_run calls can all pass the pre-check, so with a limit the insert
  // enforces it again in the same statement, and a refused run writes no audit event.
  const batchResults = await db.batch(runInsertStatements(db, run, auditEvent, owner, limit));
  if (limit !== null && batchChanges(batchResults[0]) === 0) {
    throw new ToolError("Active run limit reached", "limit_reached", { limit, current: await countActiveRuns(env, owner) });
  }
  return result;
}

/** Throws limit_reached when the context is at its active-run limit; returns the limit. */
async function assertActiveRunCapacity(env: Env, owner: RunOwnerContext): Promise<number | null> {
  const { limit, hit } = await checkActiveRunCapacity(env, owner, owner.userId);
  if (hit) throw new ToolError("Active run limit reached", "limit_reached", { ...hit });
  return limit;
}

async function listRuns(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const args = parseToolArguments(listRunsArgs, rawArguments);

  const filters = [
    eq(schema.checklist_runs.user_id, identity.userId),
    isNull(schema.checklist_runs.team_id),
    isNull(schema.checklist_runs.deleted_at),
  ];
  if (args.status) filters.push(eq(schema.checklist_runs.status, args.status));

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
  const args = parseToolArguments(getRunArgs, rawArguments);
  const run = await getOwnedRun(env, identity.userId, args.runId);
  const scoped = selectRunScope(parseStoredSections(run.items), parseRetiredItems(run), args);
  const result = { run: serializeRun(run, scoped.sections, scoped.retiredItems) };
  if (jsonByteLength(result) <= MAX_UNPAGED_RESULT_BYTES) return result;
  throw new ToolError(
    "Run is too large to return at once; call get_run again with a sectionId or taskId from details.sections "
      + "or details.retiredItems",
    "result_too_large",
    {
      limit: MAX_UNPAGED_RESULT_BYTES,
      run: summarizeRun(run),
      sections: outlineSections(scoped.sections),
      retiredItems: outlineRetiredItems(scoped.retiredItems),
    },
  );
}

// The router sets X-Request-Id on every API request before dispatch.
function requestIdOf(request: Request): string | undefined {
  return request.headers.get("X-Request-Id") ?? undefined;
}

// params.name comes from the client: log it only when it names a real tool.
function toolNameForLog(name: string): string {
  return toolDefinitions.some((tool) => tool.name === name) ? name : "unknown";
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
  const args = parseToolArguments(updateRunArgs, rawArguments);

  const existing = await getOwnedRun(env, identity.userId, args.runId);
  const currentRevision = typeof existing.revision === "number" ? existing.revision : 1;
  if (args.expectedRevision !== currentRevision) {
    throw new ToolError("Run changed since it was loaded; fetch it again before updating", "edit_conflict", {
      expectedRevision: args.expectedRevision,
      currentRevision,
    });
  }

  const sections = parseStoredSections(existing.items);
  if (args.operation === "set_run_status" && args.status === "completed" && existing.status !== "completed") {
    assertRunCanBeCompleted(sections);
  }
  if (args.operation === "set_run_status" && isReopening(existing.status, args.status)) {
    await assertActiveRunCapacity(env, { userId: identity.userId, teamId: null });
  }

  const now = new Date().toISOString();
  const updates: JsonRecord = { revision: currentRevision + 1, updated_at: now };
  if (args.operation === "set_run_status") {
    // Status only: the run content is unchanged, so it is not rewritten. Match the
    // checklist status endpoint: progress stays as it is, reopening does not erase
    // completion attribution, and marking an already completed run completed again
    // does not restamp it.
    updates.status = args.status;
    updates.progress = typeof existing.progress === "number" ? existing.progress : 0;
    Object.assign(updates, completionStamps({
      currentStatus: existing.status,
      currentCompletedAt: existing.completed_at,
      nextStatus: args.status,
      userId: identity.userId,
      now,
    }));
  } else {
    // Only notes can grow the content. Completion toggles just flip booleans (unchecking
    // adds a byte per task or subtask), so they stay allowed on a run over the cap.
    const currentBytes = args.operation === "set_task_notes" ? jsonByteLength(sections) : null;
    applyRunOperation(sections, args);
    const items = JSON.stringify(sections);
    // Checked before the write, so an oversized update never commits.
    if (currentBytes !== null) assertRunContentFits(utf8ByteLength(items), currentBytes);
    updates.items = items;
    updates.progress = calculateRunProgress(sections);
  }

  const nextRun = { ...existing, ...updates };
  const auditEvent = await buildAuditEventValues({
    actorUserId: identity.userId,
    subject: { type: "user", id: identity.userId },
    resource: { type: "checklist_run", id: args.runId },
    action: "checklist_run.updated",
    before: summarizeRunForAudit(existing),
    after: summarizeRunForAudit(nextRun),
    diff: updateRunAuditDiff(args, existing, updates),
    metadata: {
      source: "mcp",
      operation: args.operation,
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
      args.runId,
      identity.userId,
      currentRevision,
    ),
    db.update(schema.checklist_runs)
      .set(updates)
      .where(and(
        eq(schema.checklist_runs.id, args.runId),
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
    // The audit insert and the run update disagree; an orphaned audit row is possible.
    log("error", "mcp_tool_invariant", {
      requestId: requestIdOf(request),
      tool: "update_run",
      keyId: identity.keyId,
      userId: identity.userId,
      runId: args.runId,
      auditChanges,
      updateChanges,
    });
    throw new ToolError("Unable to update the run safely", "internal_invariant");
  }

  return updateRunResult(nextRun, sections, args);
}

async function callTool(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  name: string,
  rawArguments: unknown,
): Promise<{ data: JsonRecord; text: string }> {
  // A tool the key's permissions do not cover is refused before it reads anything.
  if (!keyAllowsTool(identity.permissions, name)) {
    const permission = toolPermission(name);
    if (!permission) throw new ToolError(`Unknown tool: ${name}`, "tool_not_found");
    throw new ToolError(`This Run Key does not have the ${permission} permission`, "permission_denied", { permission });
  }

  switch (name) {
    case "list_templates": {
      const data = await listTemplates(env, identity);
      return { data, text: `Found ${(data.templates as unknown[]).length} personal template(s).` };
    }
    case "get_template": {
      const data = await getTemplate(env, identity, rawArguments);
      return { data, text: describeTemplateRead(data) };
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
  } catch (error) {
    // Never log the Authorization header or any part of the Run Key.
    log("error", "mcp_auth_error", { requestId: requestIdOf(request), ...describeErrorForLog(error) });
    return rpcError(null, -32603, "Internal error", undefined, 500);
  }
  if (!identity) {
    recordFailedAuth(request);
    return rpcError(null, -32001, "Unauthorized", undefined, 401);
  }

  // Logging the key ID for every authenticated request, even a malformed one, lets an abused
  // key be found and revoked.
  const requestId = requestIdOf(request);
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
    const permissions = identity.permissions;
    return rpcResult(id, { tools: toolDefinitions.filter((tool) => keyAllowsTool(permissions, tool.name)) });
  }

  if (payload.method === "tools/call") {
    const params = isRecord(payload.params) ? payload.params : {};
    if (typeof params.name !== "string") return rpcError(id, -32602, "Tool name is required");
    log("info", "mcp_tool_call", { requestId, keyId: identity.keyId, toolName: toolNameForLog(params.name) });
    try {
      const { data, text } = await callTool(request, env, identity, params.name, params.arguments);
      if (isReadOnlyTool(params.name)) assertBoundedResult(data);
      try {
        await markPersonalRunKeyUsed(env, identity);
      } catch (error) {
        // Usage telemetry must not turn a committed tool mutation into a retryable failure.
        log("warn", "mcp_key_usage_error", {
          requestId,
          keyId: identity.keyId,
          ...describeErrorForLog(error),
        });
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
      // Expected ToolErrors above are client outcomes; anything else is a server fault.
      // Never log the tool arguments: they carry run notes and titles.
      log("error", "mcp_tool_error", {
        requestId,
        tool: toolNameForLog(params.name),
        keyId: identity.keyId,
        userId: identity.userId,
        ...describeErrorForLog(error),
      });
      // JSON-RPC errors stay HTTP 200: a 5xx can make MCP clients retry a committed write.
      return rpcError(id, -32603, "Internal error");
    }
  }

  return rpcError(id, -32601, "Method not found");
}
