import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import { parseJsonArray } from '../../../src/lib/schemas/jsonArrays';
import { json, jsonError } from '../utils/response';
import { invalidPayloadResponse } from '../utils/request-json';
import { buildAuditEventValues } from '../utils/audit';
import { z } from 'zod';
import { calculateRunProgress, reconcileRunSections, summarizeRetiredEntries } from '../utils/template-reconciliation';
import { auditedRunUpdate, findRunToUpdate, getRunSubject } from '../utils/checklist-runs';
import { batchWriteMissed } from '../utils/guarded-writes';
import { canUseTemplateAsRunSource } from '../utils/template-access';
import { reopenLimitResponse } from '../utils/active-run-limit';
import { contentTooLargeResponse } from '../utils/content-limits';

export async function revalidateChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
  checklistId: string,
): Promise<Response> {
  const { checklistRuns, templates } = schema;

  const optionalBody: unknown = await request.json().catch(() => ({}));
  const revalidateBody = z.object({
    expected_revision: z.number().int().positive().optional(),
  }).safeParse(optionalBody);
  if (!revalidateBody.success) {
    return invalidPayloadResponse(revalidateBody.error, 'Invalid revalidation payload');
  }

  const found = await findRunToUpdate(env, db, checklistId, userId, 'Checklist not found');
  if ('response' in found) return found.response;
  const { run: existingRun } = found;
  if (existingRun.is_public) {
    return jsonError('Stop sharing this run before revalidating it.', 409, { code: 'shared_run_conflict' });
  }
  if (!existingRun.template_id) {
    return jsonError('Checklist run is not linked to a template.', 400);
  }

  const currentRevision = typeof existingRun.revision === 'number' ? existingRun.revision : 1;
  if (typeof revalidateBody.data.expected_revision === 'number' && revalidateBody.data.expected_revision !== currentRevision) {
    return jsonError('Checklist run changed since it was loaded. Refresh before revalidating.', 409, {
      code: 'edit_conflict',
      details: { expectedRevision: revalidateBody.data.expected_revision, currentRevision },
    });
  }

  const [sourceTemplate] = await db
    .select({
      id: templates.id,
      items: templates.items,
      version: templates.content_version,
      is_public: templates.is_public,
      owner_type: templates.owner_type,
      team_id: templates.team_id,
      user_id: templates.user_id,
    })
    .from(templates)
    .where(and(eq(templates.id, existingRun.template_id), isNull(templates.deleted_at)))
    .limit(1);
  if (!sourceTemplate || !canUseTemplateAsRunSource(sourceTemplate, { userId, runTeamId: existingRun.team_id ?? null })) {
    return jsonError('Source template not found', 404, { code: 'source_template_unavailable' });
  }
  const reopenRefusal = await reopenLimitResponse(env, existingRun, 'in_progress', userId);
  if (reopenRefusal) return reopenRefusal;

  const previousSections = parseJsonArray(existingRun.items) ?? [];
  const previousRetired = parseJsonArray(existingRun.retired_items) ?? [];
  const templateSections = parseJsonArray(sourceTemplate.items) ?? [];
  const reconciled = reconcileRunSections(previousSections, templateSections, previousRetired);
  const tooLarge = contentTooLargeResponse('run', reconciled.sections, previousSections);
  if (tooLarge) return tooLarge;
  const now = new Date().toISOString();
  const updates = {
    items: JSON.stringify(reconciled.sections),
    retired_items: JSON.stringify(reconciled.retired),
    progress: calculateRunProgress(reconciled.sections),
    template_version: typeof sourceTemplate.version === 'number' ? sourceTemplate.version : 1,
    revision: currentRevision + 1,
    status: 'in_progress',
    completed_at: null,
    completed_by_user_id: null,
    updated_at: now,
  };
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getRunSubject(existingRun, userId),
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.revalidated',
    before: existingRun,
    after: { ...existingRun, ...updates },
    diff: updates,
    metadata: {
      templateId: sourceTemplate.id,
      templateVersion: updates.template_version,
      retired: summarizeRetiredEntries(reconciled.newlyRetired),
    },
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(auditedRunUpdate(db, checklistId, and(
    eq(checklistRuns.revision, currentRevision),
    isNull(checklistRuns.deleted_at),
  ), updates, auditEvent));

  if (batchWriteMissed(batchResults[1])) {
    return jsonError('Checklist run changed while it was being revalidated. Refresh and try again.', 409, {
      code: 'edit_conflict',
    });
  }

  return json({
    success: true,
    progress: updates.progress,
    revision: updates.revision,
    template_version: updates.template_version,
  });
}
