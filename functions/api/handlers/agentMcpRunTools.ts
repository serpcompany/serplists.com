import { and, eq, isNull, sql } from "drizzle-orm";
import type { JsonRecord } from "../../../src/lib/schemas/jsonRecords";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import {
  checkActiveRunCapacity,
  countActiveRuns,
  isReopening,
  runInsertStatements,
  type RunOwnerContext,
} from "../utils/active-run-limit";
import { buildAuditEventValues } from "../utils/audit";
import { batchChanges, type RunUpdates } from "../utils/checklist-runs";
import { log } from "../utils/logger";
import type { PersonalRunKeyIdentity } from "../utils/personal-run-key";
import { normalizeSectionsPayload, parseJsonArray } from "../utils/payloads";
import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { completionStamps } from "../utils/run-completion";
import { calculateRunProgress, resetRunCompletionState } from "../utils/template-reconciliation";
import { withStableTemplateIdentities } from "../utils/template-identities";
import { readRun, runView, startedRunResult, updatedRunResult } from "./agentMcpRunPages";
import {
  applyRunOperation,
  assertRunCanBeCompleted,
  assertRunContentFits,
  parseStoredSections,
  summarizeRun,
  summarizeRunForAudit,
  updateRunAuditDiff,
} from "./agentMcpRuns";
import { getOwnedTemplate } from "./agentMcpTemplates";
import {
  getRunArgs,
  parseToolArguments,
  startRunArgs,
  ToolError,
  updateRunArgs,
} from "./agentMcpTools";

export async function startRun(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const args = parseToolArguments(startRunArgs, rawArguments);

  const db = createDb(env);
  const template = await getOwnedTemplate(env, identity.userId, args.templateId);

  const owner = { userId: identity.userId, teamId: null };
  const limit = await assertActiveRunCapacity(env, owner);

  const normalized = normalizeSectionsPayload(parseJsonArray(template.items) ?? []);
  if (normalized.error) throw new ToolError("Template content is invalid", "invalid_template");
  const sections = resetRunCompletionState(sanitizeStoredSections(withStableTemplateIdentities(normalized.sections)));
  assertRunContentFits(sections);

  const now = new Date().toISOString();
  const run = {
    id: crypto.randomUUID(),
    user_id: identity.userId,
    team_id: null,
    template_id: template.id,
    title: args.title ?? template.title,
    items: JSON.stringify(sections),
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
  const result = startedRunResult(runView(run));
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
  const batchResults = await db.batch(runInsertStatements(db, run, auditEvent, owner, limit));
  if (limit !== null && batchChanges(batchResults[0]) === 0) {
    throw new ToolError("Active run limit reached", "limit_reached", { limit, current: await countActiveRuns(env, owner) });
  }
  return result;
}

async function assertActiveRunCapacity(env: Env, owner: RunOwnerContext): Promise<number | null> {
  const { limit, hit } = await checkActiveRunCapacity(env, owner, owner.userId);
  if (hit) throw new ToolError("Active run limit reached", "limit_reached", { ...hit });
  return limit;
}

async function getOwnedRun(env: Env, userId: string, runId: string) {
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
  return run;
}

export async function getRun(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const { runId, ...read } = parseToolArguments(getRunArgs, rawArguments);
  const run = await getOwnedRun(env, identity.userId, runId);
  return readRun(runView(run), read);
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

export async function updateRun(
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
  const updates: RunUpdates = { revision: currentRevision + 1, updated_at: now };
  if (args.operation === "set_run_status") {
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
    applyRunOperation(sections, args);
    if (args.operation === "set_task_notes") assertRunContentFits(sections, parseStoredSections(existing.items));
    updates.items = JSON.stringify(sections);
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
    log("error", "mcp_tool_invariant", {
      requestId: request.headers.get("X-Request-Id") ?? undefined,
      tool: "update_run",
      keyId: identity.keyId,
      userId: identity.userId,
      runId: args.runId,
      auditChanges,
      updateChanges,
    });
    throw new ToolError("Unable to update the run safely", "internal_invariant");
  }

  return updatedRunResult(summarizeRun(nextRun), sections, args);
}
