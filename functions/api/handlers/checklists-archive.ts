import { Env } from '../types';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { canDeleteRun, canRestoreRun, canViewRun, canViewRunHistory } from '../utils/run-access';
import { auditedRunUpdate, batchUpdateMissed, getRunSubject } from '../utils/checklist-runs';
import {
  activeRunCapacityAvailableSql,
  activeRunLimitResponse,
  checkActiveRunCapacity,
  countActiveRuns,
} from '../utils/active-run-limit';

export async function restoreChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  checklistId: string,
): Promise<Response> {
  const { checklist_runs } = schema;

  if (!checklistId || checklistId === 'checklists') {
    return jsonError('Checklist ID required', 400);
  }

  const [existingRun] = await db
    .select()
    .from(checklist_runs)
    .where(eq(checklist_runs.id, checklistId))
    .limit(1);
  const runRecord = existingRun as unknown as Record<string, unknown>;

  if (!existingRun || !(await canViewRunHistory(env, runRecord, userId))) {
    return jsonError('Checklist not found', 404);
  }
  if (!(await canRestoreRun(env, runRecord, userId))) {
    return jsonError('Forbidden', 403);
  }
  if (!(typeof runRecord.deleted_at === 'string' && runRecord.deleted_at)) {
    return jsonError('Checklist is not archived', 400, { code: 'not_archived' });
  }

  const teamId = typeof runRecord.team_id === 'string' && runRecord.team_id ? runRecord.team_id : null;
  const owner = { userId, teamId };
  const capacity = runRecord.status === 'in_progress'
    ? await checkActiveRunCapacity(env, owner, userId)
    : { limit: null, hit: null };
  if (capacity.hit) return activeRunLimitResponse(owner, capacity.hit, 'restore');

  const now = new Date().toISOString();
  const restoreUpdates = {
    deleted_at: null,
    updated_at: now,
    is_public: false,
    share_token: null,
    share_expires_at: null,
    share_used_at: null,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(runRecord, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.restored',
    before: runRecord,
    after: { ...runRecord, ...restoreUpdates },
    diff: restoreUpdates,
    request,
    createdAt: now,
  });
  const archivedRun = and(
    teamId ? eq(checklist_runs.team_id, teamId) : eq(checklist_runs.user_id, userId),
    isNotNull(checklist_runs.deleted_at),
  );
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, capacity.limit === null
    ? archivedRun
    : and(archivedRun, activeRunCapacityAvailableSql(owner, capacity.limit)), restoreUpdates, auditEvent));
  if (batchUpdateMissed(batchResults[1])) {
    if (capacity.limit !== null) {
      const current = await countActiveRuns(env, owner);
      if (current >= capacity.limit) return activeRunLimitResponse(owner, { limit: capacity.limit, current }, 'restore');
    }
    return jsonError('Checklist is not archived', 400, { code: 'not_archived' });
  }

  return json({ success: true });
}

export async function archiveChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  checklistId: string,
): Promise<Response> {
  const { checklist_runs } = schema;

  const [existingChecklist] = await db
    .select()
    .from(checklist_runs)
    .where(eq(checklist_runs.id, checklistId))
    .limit(1);

  if (!existingChecklist || !(await canViewRun(env, existingChecklist as unknown as Record<string, unknown>, userId))) {
    return jsonError('Checklist not found or unauthorized', 404);
  }
  if (!(await canDeleteRun(env, existingChecklist as unknown as Record<string, unknown>, userId))) {
    return jsonError('Forbidden', 403);
  }

  const now = new Date().toISOString();
  const archiveUpdates = {
    deleted_at: now,
    updated_at: now,
    is_public: false,
    share_token: null,
    share_expires_at: null,
    share_used_at: null,
  };

  const archivedChecklist = {
    ...(existingChecklist as unknown as Record<string, unknown>),
    ...archiveUpdates,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(existingChecklist as unknown as Record<string, unknown>, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.deleted',
    before: existingChecklist as unknown as Record<string, unknown>,
    after: archivedChecklist,
    diff: archiveUpdates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, and(
    existingChecklist.team_id ? eq(checklist_runs.team_id, existingChecklist.team_id) : eq(checklist_runs.user_id, userId),
    isNull(checklist_runs.deleted_at),
  ), archiveUpdates, auditEvent));
  if (batchUpdateMissed(batchResults[1])) {
    return jsonError('Checklist not found or unauthorized', 404);
  }

  return json({ success: true });
}
