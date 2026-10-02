import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { canUpdateRun, canViewRun } from '../utils/run-access';
import { auditedRunUpdate, batchUpdateMissed, getRunSubject } from '../utils/checklist-runs';

export async function shareChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  runId: string,
): Promise<Response> {
  const { checklist_runs } = schema;

  if (!runId || runId === 'run') {
    return jsonError('Checklist run ID required', 400);
  }

  const [run] = await db
    .select()
    .from(checklist_runs)
    .where(and(eq(checklist_runs.id, runId), isNull(checklist_runs.deleted_at)))
    .limit(1);

  if (!run || !(await canViewRun(env, run as unknown as Record<string, unknown>, userId))) {
    return jsonError('Checklist run not found', 404);
  }
  if (!(await canUpdateRun(env, run as unknown as Record<string, unknown>, userId))) {
    return jsonError('Forbidden', 403);
  }

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
    subject: getRunSubject(run as unknown as Record<string, unknown>, userId),
    resource: { type: 'checklist_run', id: runId },
    action: 'checklist_run.share_created',
    before: run as unknown as Record<string, unknown>,
    after: { ...(run as unknown as Record<string, unknown>), ...shareUpdates },
    diff: shareUpdates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, runId, and(
    run.team_id ? eq(checklist_runs.team_id, run.team_id) : eq(checklist_runs.user_id, userId),
    isNull(checklist_runs.deleted_at),
  ), shareUpdates, auditEvent));
  if (batchUpdateMissed(batchResults[1])) {
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
  const { checklist_runs } = schema;

  const [run] = await db
    .select()
    .from(checklist_runs)
    .where(and(eq(checklist_runs.id, runId), isNull(checklist_runs.deleted_at)))
    .limit(1);
  const runRecord = run as unknown as Record<string, unknown>;

  if (!run || !(await canViewRun(env, runRecord, userId))) {
    return jsonError('Checklist run not found', 404);
  }
  if (!(await canUpdateRun(env, runRecord, userId))) {
    return jsonError('Forbidden', 403);
  }
  if (!run.is_public) {
    return json({ id: runId, isPublic: false });
  }

  const now = new Date().toISOString();
  const revokeUpdates = { is_public: false, share_token: null, share_expires_at: null, share_used_at: null, updated_at: now };
  const sharedRun = and(
    run.team_id ? eq(checklist_runs.team_id, run.team_id) : eq(checklist_runs.user_id, userId),
    eq(checklist_runs.is_public, true),
    isNull(checklist_runs.deleted_at),
  );
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(runRecord, userId),
    resource: { type: 'checklist_run', id: runId },
    action: 'checklist_run.share_revoked',
    before: runRecord,
    after: { ...runRecord, ...revokeUpdates },
    diff: revokeUpdates,
    request,
    createdAt: now,
  });
  await db.batch(auditedRunUpdate(db, runId, sharedRun, revokeUpdates, auditEvent));

  return json({ id: runId, isPublic: false });
}
