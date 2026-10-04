import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { Env } from '../types';
import { schema } from '../db';
import { buildAuditEventValues, buildTemplateVersionValues, type AuditSubject } from '../utils/audit';
import { getEntitlementsForContext } from '../utils/entitlements';
import { insertRowWhere, rowExistsSql } from '../utils/guarded-insert';
import { batchWriteMissed } from '../utils/guarded-writes';
import { json, jsonError } from '../utils/response';
import { assertTeamTemplateCreateAccess, canViewPrivateTemplate } from '../utils/template-permissions';
import { findTemplateById, type TemplateDb } from '../utils/template-rows';
import {
  countTemplates,
  templateCapacityAvailableSql,
  templateLimitResponse,
  type TemplateCapacity,
  type TemplateUpdateValues,
} from '../utils/template-writes';

const transferBodySchema = z.object({
  teamId: z.string().trim().min(1),
  expected_version: z.number().int(),
});

const editConflict = (expectedVersion: number, currentVersion: number | null) =>
  jsonError('Template changed since it was loaded. Refresh before transferring it.', 409, {
    code: 'edit_conflict',
    details: { expectedVersion, currentVersion },
  });

export async function transferTemplate(
  request: Request,
  env: Env,
  db: TemplateDb,
  userId: string,
  templateId: string,
  body: unknown,
): Promise<Response> {
  const parsed = transferBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('Choose the Organization to transfer the Template to.', 400, { code: 'invalid_transfer' });
  }
  const { teamId, expected_version: expectedVersion } = parsed.data;
  const { templates, templateVersions, auditEvents } = schema;

  const existing = await findTemplateById(db, templateId);
  if (!existing || existing.deleted_at || !(await canViewPrivateTemplate(env, existing, userId))) {
    return jsonError('Template not found', 404);
  }
  const ownedPersonally = existing.owner_type !== 'team' && !existing.team_id && existing.user_id === userId;
  if (!ownedPersonally) {
    return jsonError('Only your own Personal Templates can be transferred.', 403, { code: 'not_transferable' });
  }
  if (existing.is_public) {
    return jsonError('Make the Template private before transferring it to an Organization.', 409, { code: 'template_public' });
  }
  const accessError = await assertTeamTemplateCreateAccess(env, teamId, userId);
  if (accessError) return accessError;

  const currentVersion = typeof existing.version === 'number' ? existing.version : 1;
  if (expectedVersion !== currentVersion) return editConflict(expectedVersion, currentVersion);

  const entitlements = await getEntitlementsForContext(env, { type: 'team', teamId, userId });
  const owner = { userId, teamId };
  const capacity: TemplateCapacity | null = entitlements.limits.maxTemplates === null
    ? null
    : { owner, limit: entitlements.limits.maxTemplates };
  if (capacity) {
    const current = await countTemplates(env, owner);
    if (current >= capacity.limit) return templateLimitResponse(owner, 'save', capacity.limit, current);
  }

  const now = new Date().toISOString();
  const nextVersion = currentVersion + 1;
  const transfer: TemplateUpdateValues = {
    owner_type: 'team',
    team_id: teamId,
    version: nextVersion,
    updated_at: now,
    updated_by_user_id: userId,
  };
  const transferred = { ...existing, ...transfer };
  const subject: AuditSubject = { type: 'team', id: teamId };

  const stillTransferable: SQL[] = [
    eq(templates.owner_type, 'user'),
    eq(templates.user_id, userId),
    isNull(templates.team_id),
    isNull(templates.deleted_at),
    eq(templates.version, currentVersion),
  ];
  const privateTemplate = or(eq(templates.is_public, false), isNull(templates.is_public));
  if (privateTemplate) stillTransferable.push(privateTemplate);
  if (capacity) stillTransferable.push(templateCapacityAvailableSql(capacity));
  const guard = and(...stillTransferable);
  if (!guard) return jsonError('Template not found', 404);

  const versionValues = await buildTemplateVersionValues({
    templateId,
    version: nextVersion,
    changedByUserId: userId,
    subject,
    snapshot: transferred,
    changeSummary: 'template.transferred_to_organization',
    createdAt: now,
  });
  const auditEvent = await buildAuditEventValues({
    actorUserId: userId,
    subject,
    resource: { type: 'template', id: templateId },
    action: 'template.transferred_to_organization',
    before: existing,
    after: transferred,
    diff: transfer as Record<string, unknown>,
    metadata: { fromUserId: userId, toTeamId: teamId },
    request,
    createdAt: now,
  });

  const results = await db.batch([
    insertRowWhere(db, templateVersions, versionValues, rowExistsSql(templates.id, templateId, guard)),
    insertRowWhere(db, auditEvents, auditEvent, rowExistsSql(templates.id, templateId, guard)),
    db.update(templates).set(transfer).where(and(eq(templates.id, templateId), guard)),
  ]);
  if (batchWriteMissed(results[2])) {
    if (capacity) {
      const current = await countTemplates(env, owner);
      if (current >= capacity.limit) return templateLimitResponse(owner, 'save', capacity.limit, current);
    }
    const latest = await findTemplateById(db, templateId);
    return editConflict(expectedVersion, typeof latest?.version === 'number' ? latest.version : null);
  }

  return json({ success: true, id: templateId, teamId, version: nextVersion });
}
