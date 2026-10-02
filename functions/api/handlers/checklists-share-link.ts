import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { auditedRunUpdate, findRunToUpdate, getRunSubject } from '../utils/checklist-runs';
import { batchWriteMissed } from '../utils/guarded-writes';

export async function shareChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  runId: string,
): Promise<Response> {
  const { checklistRuns } = schema;

  if (!runId || runId === 'run') {
    return jsonError('Checklist run ID required', 400);
  }

  const found = await findRunToUpdate(env, db, runId, userId, 'Checklist run not found');
  if ('response' in found) return found.response;
  const { run } = found;

  const now = new Date().toISOString();
  const shareToken = crypto.randomUUID();
  const shareUpdates = {
    is_public: true,
    share_token: shareToken,
    share_expires_at: now,
    share_used_at: null,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(run, userId),
    resource: { type: 'checklist_run', id: runId },
    action: 'checklist_run.share_created',
    before: run,
    after: { ...run, ...shareUpdates },
    diff: shareUpdates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, runId, and(
    run.team_id ? eq(checklistRuns.team_id, run.team_id) : eq(checklistRuns.user_id, userId),
    isNull(checklistRuns.deleted_at),
  ), shareUpdates, auditEvent));
  if (batchWriteMissed(batchResults[1])) {
    return jsonError('Checklist run not found', 404);
  }

  return json({
    id: runId,
    shareToken,
    sharePath: `/share/${shareToken}/`,
  });
}

export async function stopSharingChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  runId: string,
): Promise<Response> {
  const { checklistRuns } = schema;

  const found = await findRunToUpdate(env, db, runId, userId, 'Checklist run not found');
  if ('response' in found) return found.response;
  const { run } = found;
  if (!run.is_public) {
    return json({ id: runId, isPublic: false });
  }

  const now = new Date().toISOString();
  const revokeUpdates = { is_public: false, share_token: null, share_expires_at: null, share_used_at: null, updated_at: now };
  const sharedRun = and(
    run.team_id ? eq(checklistRuns.team_id, run.team_id) : eq(checklistRuns.user_id, userId),
    eq(checklistRuns.is_public, true),
    isNull(checklistRuns.deleted_at),
  );
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(run, userId),
    resource: { type: 'checklist_run', id: runId },
    action: 'checklist_run.share_revoked',
    before: run,
    after: { ...run, ...revokeUpdates },
    diff: revokeUpdates,
    request,
    createdAt: now,
  });
  await db.batch(auditedRunUpdate(db, runId, sharedRun, revokeUpdates, auditEvent));

  return json({ id: runId, isPublic: false });
}
