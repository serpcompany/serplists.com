import { Env } from '../types';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { schema } from '../db';
import { json, jsonError } from '../utils/response';
import { getEntitlementsForContext, getEntitlementsForUser } from '../utils/entitlements';
import { buildAuditEventValues } from '../utils/audit';
import { insertRowWhere, rowExistsSql } from '../utils/guarded-insert';
import {
  countTemplates,
  templateCapacityAvailableSql,
  templateLimitResponse,
  type TemplateUpdateValues,
} from '../utils/template-writes';
import { batchUpdateMissed } from '../utils/checklist-runs';
import { getTemplateSelectColumns, withRulesColumnFallback, type TemplateDb } from '../utils/template-rows';
import {
  canEditTemplate,
  canViewPrivateTemplate,
  canViewTemplate,
  getTemplateSubject,
} from '../utils/template-permissions';

export async function restoreTemplate(
  request: Request,
  env: Env,
  db: TemplateDb,
  userId: string,
  templateId: string,
): Promise<Response> {
  const { templates, audit_events } = schema;

  if (!templateId || templateId === 'templates') {
    return jsonError('Template ID required', 400);
  }

  const [existingTemplate] = await withRulesColumnFallback((includeRules) =>
    db
      .select(getTemplateSelectColumns(includeRules))
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1),
  );
  const templateRecord = existingTemplate as unknown as Record<string, unknown>;

  if (!existingTemplate || !(await canViewPrivateTemplate(env, templateRecord, userId))) {
    return jsonError('Template not found', 404);
  }
  if (!(await canEditTemplate(env, templateRecord, userId))) {
    return jsonError('Forbidden', 403);
  }
  if (!(typeof templateRecord.deleted_at === 'string' && templateRecord.deleted_at)) {
    return jsonError('Template is not archived', 400, { code: 'not_archived' });
  }

  const teamId = templateRecord.owner_type === 'team' && typeof templateRecord.team_id === 'string'
    ? templateRecord.team_id
    : null;
  const entitlements = teamId
    ? await getEntitlementsForContext(env, { type: 'team', teamId, userId })
    : await getEntitlementsForUser(env, userId);
  const owner = { userId, teamId };
  const limit = entitlements.plan === 'free' && entitlements.limits.maxTemplates ? entitlements.limits.maxTemplates : null;
  if (limit !== null) {
    const currentCount = await countTemplates(env, owner);
    if (currentCount >= limit) return templateLimitResponse(owner, 'restore', limit, currentCount);
  }

  const now = new Date().toISOString();
  const restoreUpdates: TemplateUpdateValues = {
    deleted_at: null,
    updated_at: now,
    updated_by_user_id: userId,
    is_public: false,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getTemplateSubject(templateRecord, userId),
    resource: { type: 'template', id: templateId },
    action: 'template.restored',
    before: templateRecord,
    after: { ...templateRecord, ...restoreUpdates },
    diff: restoreUpdates as Record<string, unknown>,
    request,
    createdAt: now,
  });
  const archivedTemplate = teamId
    ? and(eq(templates.team_id, teamId), isNotNull(templates.deleted_at))
    : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNotNull(templates.deleted_at));
  const stillArchivedWithinLimit = limit === null
    ? archivedTemplate
    : and(archivedTemplate, templateCapacityAvailableSql({ owner, limit }));
  const restoreResults = await db.batch([
    insertRowWhere(db, audit_events, auditEvent, rowExistsSql(templates.id, templateId, stillArchivedWithinLimit)),
    db.update(templates).set(restoreUpdates).where(and(eq(templates.id, templateId), stillArchivedWithinLimit)),
  ]);
  if (batchUpdateMissed(restoreResults[1])) {
    if (limit !== null) {
      const currentCount = await countTemplates(env, owner);
      if (currentCount >= limit) return templateLimitResponse(owner, 'restore', limit, currentCount);
    }
    return jsonError('Template is not archived', 400, { code: 'not_archived' });
  }

  return json({ success: true });
}

export async function archiveTemplate(
  request: Request,
  env: Env,
  db: TemplateDb,
  userId: string,
  templateId: string,
): Promise<Response> {
  const { templates, audit_events } = schema;

  const [existingTemplate] = await withRulesColumnFallback((includeRules) =>
    db
      .select(getTemplateSelectColumns(includeRules))
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1),
  );

  if (!existingTemplate || !(await canViewTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
    return jsonError('Template not found or unauthorized', 404);
  }
  if (!(await canEditTemplate(env, existingTemplate as unknown as Record<string, unknown>, userId))) {
    return jsonError('Forbidden', 403);
  }

  const now = new Date().toISOString();
  const archiveUpdates: TemplateUpdateValues = {
    deleted_at: now,
    updated_at: now,
    updated_by_user_id: userId,
    is_public: false,
  };

  const archivedTemplate = {
    ...(existingTemplate as unknown as Record<string, unknown>),
    ...archiveUpdates,
  };

  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject: getTemplateSubject(existingTemplate as unknown as Record<string, unknown>, userId),
    resource: { type: 'template', id: templateId },
    action: 'template.deleted',
    before: existingTemplate as unknown as Record<string, unknown>,
    after: archivedTemplate,
    diff: archiveUpdates as Record<string, unknown>,
    request,
    createdAt: now,
  });
  const activeTemplate = existingTemplate.owner_type === 'team' && existingTemplate.team_id
    ? and(eq(templates.team_id, existingTemplate.team_id), isNull(templates.deleted_at))
    : and(eq(templates.owner_type, 'user'), eq(templates.user_id, userId), isNull(templates.team_id), isNull(templates.deleted_at));
  const archiveResults = await db.batch([
    insertRowWhere(db, audit_events, auditEvent, rowExistsSql(templates.id, templateId, activeTemplate)),
    db.update(templates).set(archiveUpdates).where(and(eq(templates.id, templateId), activeTemplate)),
  ]);
  if (batchUpdateMissed(archiveResults[1])) {
    return jsonError('Template not found or unauthorized', 404);
  }

  return json({ success: true });
}
