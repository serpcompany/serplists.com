import { Env } from '../types';
import { and, eq, isNull } from 'drizzle-orm';
import { createDb, schema } from '../db';
import {
  checklistPayloadSchema,
  getRequestedTeamId,
  normalizeSectionsPayload,
  parseSectionsPayload,
} from '../utils/payloads';
import { parseJsonArray } from '../../../src/lib/schemas/jsonArrays';
import { sanitizeStoredSections } from '../../../src/lib/schemas/storedSections';
import { json, jsonError } from '../utils/response';
import { readJsonPayload } from '../utils/request-json';
import { buildAuditEventValues } from '../utils/audit';
import { canRunTeamTemplates, getActiveTeamMembership, normalizeTeamRole } from '../utils/team-access';
import { resetRunCompletionState } from '../utils/template-reconciliation';
import { batchWriteMissed } from '../utils/guarded-writes';
import { canUseTemplateAsRunSource } from '../utils/template-access';
import { withStableTemplateIdentities } from '../utils/template-identities';
import {
  activeRunLimitResponse,
  checkActiveRunCapacity,
  countActiveRuns,
  runInsertStatements,
} from '../utils/active-run-limit';
import { completionStamps } from '../utils/run-completion';
import { contentTooLargeResponse } from '../utils/content-limits';

async function assertTeamRunAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return jsonError('Organization not found', 404);
  if (!canRunTeamTemplates(normalizeTeamRole(membership.role))) return jsonError('Forbidden', 403);
  return null;
}

async function resolveTemplateRunSource(
  env: Env,
  templateId: string,
  userId: string,
  requestedTeamId: string | null,
): Promise<{
  error?: Response;
  source?: {
    effectiveTeamId: string | null;
    sections: unknown[];
    title: string;
    version: number;
  };
}> {
  const db = createDb(env);
  const { templates } = schema;
  const [sourceTemplate] = await db
    .select({
      id: templates.id,
      user_id: templates.user_id,
      owner_type: templates.owner_type,
      team_id: templates.team_id,
      title: templates.title,
      items: templates.items,
      is_public: templates.is_public,
      version: templates.content_version,
    })
    .from(templates)
    .where(and(eq(templates.id, templateId), isNull(templates.deleted_at)))
    .limit(1);

  if (!sourceTemplate) {
    return { error: jsonError('Template not found', 404) };
  }

  const sourceTeamId = typeof sourceTemplate.team_id === 'string' && sourceTemplate.team_id
    ? sourceTemplate.team_id
    : null;
  const sourceIsPublic = Boolean(sourceTemplate.is_public);
  const isPrivateTeamTemplate = sourceTemplate.owner_type === 'team' && sourceTeamId && !sourceIsPublic;
  const effectiveTeamId = isPrivateTeamTemplate ? sourceTeamId : requestedTeamId;

  if (isPrivateTeamTemplate && requestedTeamId && requestedTeamId !== sourceTeamId) {
    return {
      error: await getActiveTeamMembership(env, sourceTeamId, userId)
        ? jsonError('This Template belongs to another Organization. Switch to it to start a Run.', 409, {
            code: 'organization_mismatch',
            details: { teamId: sourceTeamId },
          })
        : jsonError('Template not found', 404),
    };
  }
  if (!canUseTemplateAsRunSource(sourceTemplate, { userId, runTeamId: effectiveTeamId })) {
    return { error: jsonError('Template not found', 404) };
  }

  const normalizedSections = normalizeSectionsPayload(parseJsonArray(sourceTemplate.items) ?? []);
  if (normalizedSections.error) {
    return { error: jsonError('Template content is invalid', 500) };
  }

  return {
    source: {
      effectiveTeamId,
      sections: resetRunCompletionState(sanitizeStoredSections(withStableTemplateIdentities(normalizedSections.sections))),
      title: sourceTemplate.title || '',
      version: typeof sourceTemplate.version === 'number' ? sourceTemplate.version : 1,
    },
  };
}

export async function createChecklistRun(
  request: Request,
  env: Env,
  db: ReturnType<typeof createDb>,
  url: URL,
  userId: string,
): Promise<Response> {
  const read = await readJsonPayload(request, checklistPayloadSchema, 'Invalid checklist payload');
  if ('response' in read) return read.response;

  const { template_id, title, items, sections, status, teamId: payloadTeamId, team_id: payloadTeamIdSnake } = read.payload;
  const requestedTeamId = getRequestedTeamId({ teamId: payloadTeamId, team_id: payloadTeamIdSnake }, url);
  const templateRunSource = template_id
    ? await resolveTemplateRunSource(env, template_id, userId, requestedTeamId)
    : {};
  if (templateRunSource.error) {
    return templateRunSource.error;
  }

  const effectiveTeamId = templateRunSource.source?.effectiveTeamId ?? requestedTeamId;
  if (effectiveTeamId) {
    const accessError = await assertTeamRunAccess(env, effectiveTeamId, userId);
    if (accessError) return accessError;
  }

  const owner = { userId, teamId: effectiveTeamId };
  const capacity = await checkActiveRunCapacity(env, owner, userId);
  if (capacity.hit) return activeRunLimitResponse(owner, capacity.hit, 'create');

  const checklistId = crypto.randomUUID();
  const now = new Date().toISOString();

  const normalizedSections = templateRunSource.source
    ? { sections: templateRunSource.source.sections }
    : parseSectionsPayload(sections ?? items);
  if (normalizedSections.error) {
    return jsonError(normalizedSections.error, 400);
  }
  const tooLarge = contentTooLargeResponse('run', normalizedSections.sections);
  if (tooLarge) return tooLarge;

  const insertedRun = {
    id: checklistId,
    user_id: userId,
    team_id: effectiveTeamId,
    template_id: template_id ?? null,
    title: title || templateRunSource.source?.title || '',
    items: JSON.stringify(normalizedSections.sections),
    status: status || 'in_progress',
    started_at: now,
    created_by_user_id: userId,
    started_by_user_id: userId,
    created_at: now,
    template_version: templateRunSource.source?.version ?? 1,
    revision: 1,
    retired_items: '[]',
    ...completionStamps({ currentStatus: null, currentCompletedAt: null, nextStatus: status, userId, now }),
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: effectiveTeamId ? { type: 'team', id: effectiveTeamId } : { type: 'user', id: userId },
    resource: { type: 'checklist_run', id: checklistId },
    action: 'checklist_run.created',
    after: insertedRun,
    request,
    createdAt: now,
  });
  const batchResults = await db.batch(runInsertStatements(db, insertedRun, auditEvent, owner, capacity.limit));
  if (capacity.limit !== null && batchWriteMissed(batchResults[0])) {
    return activeRunLimitResponse(owner, { limit: capacity.limit, current: await countActiveRuns(env, owner) }, 'create');
  }

  return json({ id: checklistId });
}
