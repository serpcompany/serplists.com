import { and, eq, isNull } from 'drizzle-orm';
import { Env } from '../types';
import { createDb, schema } from '../db';
import { json, jsonError } from '../utils/response';
import { readJsonPayload } from '../utils/request-json';
import { buildAuditEventValues } from '../utils/audit';
import { calculateRunProgress } from '../utils/template-reconciliation';
import {
  getRunSubject,
  serializeSharedChecklistRun,
  sharedChecklistRunSelect,
  writeAuditedRunUpdate,
  type RunUpdates,
} from '../utils/checklist-runs';
import { mergeSharedRunState, readStoredRunSections, sharedRunUpdateSchema } from '../utils/shared-run-merge';
import { checkReopenCapacity, reopenLimitResponse } from '../utils/active-run-limit';
import { canViewRun } from '../utils/run-access';
import { completionStamps, findRunCompletionRefusal } from '../utils/run-completion';
import { contentTooLargeResponse } from '../utils/content-limits';
import { completedRunTaskChangeResponse } from '../utils/completed-run-freeze';

export async function handleSharedChecklist(
  request: Request,
  env: Env,
  shareToken: string,
  userId: string | null,
): Promise<Response> {
  const db = createDb(env);
  const { checklistRuns } = schema;
  const activeShare = and(
    eq(checklistRuns.share_token, shareToken),
    eq(checklistRuns.is_public, true),
    isNull(checklistRuns.deleted_at),
  );

  if (request.method === 'GET') {
    const [checklist] = await db.select(sharedChecklistRunSelect()).from(checklistRuns).where(activeShare).limit(1);

    if (!checklist) {
      return jsonError('Shared run not found', 404);
    }

    return json(serializeSharedChecklistRun(checklist));
  }

  if (request.method !== 'PUT') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const [existingSharedRun] = await db.select().from(checklistRuns).where(activeShare).limit(1);

  if (!existingSharedRun || !existingSharedRun.id) {
    return jsonError('Shared run not found', 404);
  }

  const read = await readJsonPayload(request, sharedRunUpdateSchema, 'Invalid checklist payload');
  if ('response' in read) return read.response;

  const { sections, status, expected_revision } = read.payload;
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

  const reopen = await checkReopenCapacity(env, existingSharedRun, status, userId);
  const reopenRefusal = reopenLimitResponse(reopen);
  if (reopenRefusal) return reopenRefusal;

  const storedSections = readStoredRunSections(existingSharedRun.items);
  if (!storedSections) {
    return jsonError('Shared run content could not be read', 500);
  }

  const actorUserId = userId && (await canViewRun(env, existingSharedRun, userId)) ? userId : null;

  const now = new Date().toISOString();
  const updates: RunUpdates = {};
  let nextSections = storedSections;
  if (sections !== undefined) {
    const merged = mergeSharedRunState(storedSections, sections);
    if ('error' in merged) {
      return jsonError(merged.error, 400);
    }
    nextSections = merged.sections;
    const frozen = completedRunTaskChangeResponse(existingSharedRun, status, storedSections, nextSections);
    if (frozen) return frozen;
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
    subject: getRunSubject(existingSharedRun, existingSharedRun.user_id),
    resource: { type: 'checklist_run', id: existingSharedRun.id },
    action: 'checklist_run.shared_updated',
    before: existingSharedRun,
    after: { ...existingSharedRun, ...updates },
    diff: updates,
    metadata: { source: 'public_share' },
    request,
    createdAt: now,
  });
  const missed = await writeAuditedRunUpdate(env, db, {
    runId: existingSharedRun.id,
    guard: and(eq(checklistRuns.revision, currentRevision), activeShare),
    reopen,
    updates,
    auditEvent,
    conflictMessage: 'Checklist run changed while it was being saved. Refresh before saving again.',
  });
  if (missed) return missed;

  return json({ success: true, revision: currentRevision + 1, progress: updates.progress });
}
