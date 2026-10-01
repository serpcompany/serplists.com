import { and, eq, isNull } from 'drizzle-orm';
import { Env } from '../types';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { calculateRunProgress } from '../utils/template-reconciliation';
import {
  auditedRunUpdate,
  batchUpdateMissed,
  getRunSubject,
  serializeSharedChecklistRun,
  sharedChecklistRunSelect,
} from '../utils/checklist-runs';
import { mergeSharedRunState, readStoredRunSections, sharedRunUpdateSchema } from '../utils/shared-run-merge';
import { activeRunLimitResponse, findActiveRunLimitHit, isReopening } from '../utils/active-run-limit';
import { canViewRun } from '../utils/run-access';
import { completionStamps, findRunCompletionRefusal } from '../utils/run-completion';
import { contentTooLargeResponse } from '../utils/content-limits';

export async function handleSharedChecklist(
  request: Request,
  env: Env,
  shareToken: string,
  userId: string | null,
): Promise<Response> {
  const db = createDb(env);
  const { checklist_runs } = schema;
  const activeShare = and(
    eq(checklist_runs.share_token, shareToken),
    eq(checklist_runs.is_public, true),
    isNull(checklist_runs.deleted_at),
  );

  if (request.method === 'GET') {
    const [checklist] = await db.select(sharedChecklistRunSelect()).from(checklist_runs).where(activeShare).limit(1);

    if (!checklist) {
      return jsonError('Shared run not found', 404);
    }

    return json(serializeSharedChecklistRun(checklist as unknown as Record<string, unknown>));
  }

  if (request.method !== 'PUT') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const [existingSharedRun] = await db.select().from(checklist_runs).where(activeShare).limit(1);

  if (!existingSharedRun || !existingSharedRun.id) {
    return jsonError('Shared run not found', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON payload', 400);
  }

  const parsed = sharedRunUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || 'Invalid checklist payload', 400);
  }

  const { sections, status, expected_revision } = parsed.data;
  if (sections === undefined && status === undefined) {
    return jsonError('No fields to update', 400);
  }

  const currentRevision = typeof existingSharedRun.revision === 'number' ? existingSharedRun.revision : 1;
  if (expected_revision !== currentRevision) {
    return jsonError('Checklist run changed since it was loaded. Refresh before saving again.', 409, {
      code: 'edit_conflict',
      details: { expectedRevision: expected_revision, currentRevision },
    });
  }

  if (isReopening(existingSharedRun.status, status)) {
    const owner = { userId: existingSharedRun.user_id, teamId: existingSharedRun.team_id ?? null };
    const limitHit = await findActiveRunLimitHit(env, owner, userId);
    if (limitHit) return activeRunLimitResponse(owner, limitHit, 'reopen');
  }

  const storedSections = readStoredRunSections(existingSharedRun.items);
  if (!storedSections) {
    return jsonError('Shared run content could not be read', 500);
  }

  const runRecord = existingSharedRun as unknown as Record<string, unknown>;
  const actorUserId = userId && (await canViewRun(env, runRecord, userId)) ? userId : null;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  let nextSections = storedSections;
  if (sections !== undefined) {
    const merged = mergeSharedRunState(storedSections, sections);
    if ('error' in merged) {
      return jsonError(merged.error, 400);
    }
    nextSections = merged.sections;
    const tooLarge = contentTooLargeResponse('run', nextSections, storedSections);
    if (tooLarge) return tooLarge;
    updates.items = JSON.stringify(nextSections);
  }
  if (status === 'completed' && existingSharedRun.status !== 'completed') {
    const refusal = findRunCompletionRefusal(nextSections);
    if (refusal) {
      return jsonError(refusal.message, 409, {
        code: 'run_incomplete',
        details: { openTaskCount: refusal.openTaskIds.length },
      });
    }
  }
  if (status !== undefined) {
    updates.status = status;
  }
  if (status === 'completed') {
    updates.share_used_at = now;
  }
  Object.assign(updates, completionStamps({
    currentStatus: existingSharedRun.status,
    currentCompletedAt: existingSharedRun.completed_at,
    nextStatus: status,
    userId: actorUserId,
    now,
  }));
  updates.progress = calculateRunProgress(nextSections);
  updates.revision = currentRevision + 1;
  updates.updated_at = now;

  const auditEvent = await buildAuditEventValues({
    actorUserId,
    subject: getRunSubject(runRecord, typeof existingSharedRun.user_id === 'string' ? existingSharedRun.user_id : 'unknown'),
    resource: { type: 'checklist_run', id: existingSharedRun.id },
    action: 'checklist_run.shared_updated',
    before: runRecord,
    after: { ...runRecord, ...updates },
    diff: updates,
    metadata: { source: 'public_share' },
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(
    db,
    existingSharedRun.id,
    and(eq(checklist_runs.revision, currentRevision), activeShare),
    updates,
    auditEvent,
  ));

  if (batchUpdateMissed(batchResults[1])) {
    return jsonError('Checklist run changed while it was being saved. Refresh before saving again.', 409, {
      code: 'edit_conflict',
    });
  }

  return json({ success: true, revision: currentRevision + 1, progress: updates.progress });
}
