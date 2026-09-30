import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { checklistPayloadSchema, parseJsonArray, parseSectionsPayload } from '../utils/payloads';
import { json, jsonError } from '../utils/response';
import { buildAuditEventValues } from '../utils/audit';
import { canUpdateRun, canViewRun } from '../utils/run-access';
import { auditedRunUpdate, batchUpdateMissed, getRunSubject } from '../utils/checklist-runs';
import { activeRunLimitResponse, findActiveRunLimitHit, isReopening } from '../utils/active-run-limit';
import { completionStamps } from '../utils/run-completion';
import { contentTooLargeResponse } from '../utils/content-limits';

export async function updateChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  checklistId: string,
): Promise<Response> {
  const { checklist_runs } = schema;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON payload', 400);
  }

  const parsed = checklistPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || 'Invalid checklist payload', 400);
  }

  const { title, items, sections, status, progress, completed_at, expected_revision } = parsed.data;
  const rawBody = body as Record<string, unknown>;

  // Build dynamic update query
  const updates: Record<string, unknown> = {};
  let nextSections: unknown[] | null = null;

  if (title !== undefined) {
    updates.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, 'sections') || Object.prototype.hasOwnProperty.call(rawBody, 'items')) {
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
  // completed_at is not a field of its own: completionStamps below uses it only when the
  // run becomes completed, and ignores the value the run page echoes on later saves.

  if (Object.keys(updates).length === 0) {
    return jsonError('No fields to update', 400);
  }

  const [existingRun] = await db
    .select()
    .from(checklist_runs)
    .where(and(eq(checklist_runs.id, checklistId), isNull(checklist_runs.deleted_at)))
    .limit(1);

  if (!existingRun || !(await canViewRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
    return jsonError('Checklist not found', 404);
  }
  if (!(await canUpdateRun(env, existingRun as unknown as Record<string, unknown>, userId))) {
    return jsonError('Forbidden', 403);
  }

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
  // Only a real reopen counts: the run page sends the current status with every save.
  if (isReopening(existingRun.status, status)) {
    const runOwner = { userId: existingRun.user_id, teamId: existingRun.team_id ?? null };
    const limitHit = await findActiveRunLimitHit(env, runOwner, userId);
    if (limitHit) return activeRunLimitResponse(runOwner, limitHit, 'reopen');
  }

  const now = new Date().toISOString();
  updates.updated_at = now;
  updates.revision = currentRevision + 1;
  // Only a real completion names the completer; the revision guard below keeps
  // existingRun.status current for this decision.
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
    subject: getRunSubject(existingRun as unknown as Record<string, unknown>, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.updated',
    before: existingRun as unknown as Record<string, unknown>,
    after: { ...(existingRun as unknown as Record<string, unknown>), ...updates },
    diff: updates,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, and(
    existingRun.team_id ? eq(checklist_runs.team_id, existingRun.team_id) : eq(checklist_runs.user_id, userId),
    eq(checklist_runs.revision, currentRevision),
    isNull(checklist_runs.deleted_at),
  ), updates, auditEvent));

  if (batchUpdateMissed(batchResults[1])) {
    return jsonError('Checklist run changed while it was being saved. Refresh before saving again.', 409, {
      code: 'edit_conflict',
    });
  }

  return json({ success: true, revision: currentRevision + 1 });
}
