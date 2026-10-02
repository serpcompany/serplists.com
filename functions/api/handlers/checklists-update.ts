import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, parseSectionsPayload } from '../utils/payloads';
import { parseJsonArray } from '../../../src/lib/schemas/jsonArrays';
import { json, jsonError } from '../utils/response';
import { readJsonPayload } from '../utils/request-json';
import { buildAuditEventValues } from '../utils/audit';
import { auditedRunUpdate, findRunToUpdate, getRunSubject, type RunUpdates } from '../utils/checklist-runs';
import { batchWriteMissed } from '../utils/guarded-writes';
import { reopenLimitResponse } from '../utils/active-run-limit';
import { completionStamps } from '../utils/run-completion';
import { contentTooLargeResponse } from '../utils/content-limits';

export async function updateChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  checklistId: string,
): Promise<Response> {
  const { checklistRuns } = schema;

  const read = await readJsonPayload(request, checklistPayloadSchema, 'Invalid checklist payload');
  if ('response' in read) return read.response;
  const { body } = read;

  const { title, items, sections, status, progress, completed_at, expected_revision } = read.payload;
  const updates: RunUpdates = {};
  let nextSections: unknown[] | null = null;

  if (title !== undefined) {
    updates.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sections') || Object.prototype.hasOwnProperty.call(body, 'items')) {
    const normalizedSections = parseSectionsPayload(sections ?? items);
    if (normalizedSections.error) {
      return jsonError(normalizedSections.error, 400);
    }
    nextSections = normalizedSections.sections;
    updates.items = JSON.stringify(nextSections);
  }
  if (status !== undefined) {
    updates.status = status;
  }
  if (progress !== undefined) {
    updates.progress = progress;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError('No fields to update', 400);
  }

  const found = await findRunToUpdate(env, db, checklistId, userId, 'Checklist not found');
  if ('response' in found) return found.response;
  const { run: existingRun } = found;

  const currentRevision = typeof existingRun.revision === 'number' ? existingRun.revision : 1;
  if (typeof expected_revision === 'number' && expected_revision !== currentRevision) {
    return jsonError('Checklist run changed since it was loaded. Refresh before saving again.', 409, {
      code: 'edit_conflict',
      details: { expectedRevision: expected_revision, currentRevision },
    });
  }
  if (nextSections) {
    const tooLarge = contentTooLargeResponse('run', nextSections, parseJsonArray(existingRun.items) ?? []);
    if (tooLarge) return tooLarge;
  }
  const reopenRefusal = await reopenLimitResponse(env, existingRun, status, userId);
  if (reopenRefusal) return reopenRefusal;

  const now = new Date().toISOString();
  updates.updated_at = now;
  updates.revision = currentRevision + 1;
  Object.assign(updates, completionStamps({
    currentStatus: existingRun.status,
    currentCompletedAt: existingRun.completed_at,
    nextStatus: status,
    requestedCompletedAt: completed_at,
    userId,
    now,
  }));

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(existingRun, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.updated',
    before: existingRun,
    after: { ...existingRun, ...updates },
    diff: updates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, and(
    existingRun.team_id ? eq(checklistRuns.team_id, existingRun.team_id) : eq(checklistRuns.user_id, userId),
    eq(checklistRuns.revision, currentRevision),
    isNull(checklistRuns.deleted_at),
  ), updates, auditEvent));

  if (batchWriteMissed(batchResults[1])) {
    return jsonError('Checklist run changed while it was being saved. Refresh before saving again.', 409, {
      code: 'edit_conflict',
    });
  }

  return json({ success: true, revision: currentRevision + 1 });
}
