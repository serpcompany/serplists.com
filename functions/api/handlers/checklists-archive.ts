import { Env } from '../types';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { canDeleteRun, canRestoreRun, canViewRun, canViewRunHistory } from '../utils/run-access';
import { auditedRunUpdate, getRunSubject } from '../utils/checklist-runs';
import { batchWriteMissed } from '../utils/guarded-writes';
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
  const { checklistRuns } = schema;

  if (!checklistId || checklistId === 'checklists') {
    return jsonError('Checklist ID required', 400);
  }

  const [existingRun] = await db
    .select()
    .from(checklistRuns)
    .where(eq(checklistRuns.id, checklistId))
    .limit(1);

  if (!existingRun || !(await canViewRunHistory(env, existingRun, userId))) {
    return jsonError('Checklist not found', 404);
  }
  if (!(await canRestoreRun(env, existingRun, userId))) {
    return jsonError('Forbidden', 403);
  }
  if (!existingRun.deleted_at) {
    return jsonError('Checklist is not archived', 400, { code: 'not_archived' });
  }

  const teamId = existingRun.team_id || null;
  const owner = { userId, teamId };
  const capacity = existingRun.status === 'in_progress'
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
    subject: getRunSubject(existingRun, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.restored',
    before: existingRun,
    after: { ...existingRun, ...restoreUpdates },
    diff: restoreUpdates,
    request,
    createdAt: now,
  });
  const archivedRun = and(
    teamId ? eq(checklistRuns.team_id, teamId) : eq(checklistRuns.user_id, userId),
    isNotNull(checklistRuns.deleted_at),
  );
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, capacity.limit === null
    ? archivedRun
    : and(archivedRun, activeRunCapacityAvailableSql(owner, capacity.limit)), restoreUpdates, auditEvent));
  if (batchWriteMissed(batchResults[1])) {
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
  const { checklistRuns } = schema;

  const [existingChecklist] = await db
    .select()
    .from(checklistRuns)
    .where(eq(checklistRuns.id, checklistId))
    .limit(1);

  if (!existingChecklist || !(await canViewRun(env, existingChecklist, userId))) {
    return jsonError('Checklist not found or unauthorized', 404);
  }
  if (!(await canDeleteRun(env, existingChecklist, userId))) {
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
    ...existingChecklist,
    ...archiveUpdates,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(existingChecklist, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.deleted',
    before: existingChecklist,
    after: archivedChecklist,
    diff: archiveUpdates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, and(
    existingChecklist.team_id ? eq(checklistRuns.team_id, existingChecklist.team_id) : eq(checklistRuns.user_id, userId),
    isNull(checklistRuns.deleted_at),
  ), archiveUpdates, auditEvent));
  if (batchWriteMissed(batchResults[1])) {
    return jsonError('Checklist not found or unauthorized', 404);
  }

  return json({ success: true });
}
