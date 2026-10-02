import type { schema } from '../db';
import type { Env } from '../types';
import type { AuditSubject } from './audit';
import { jsonError } from './response';
import { canEditTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole, type TeamRole } from './team-access';
import { toPublicTemplate } from './template-public';
import { parseTemplateRow, type TemplateRowColumns } from './template-rows';

type TemplateRow = typeof schema.templates.$inferSelect;
export type TemplateOwnerFields = Pick<TemplateRow, 'owner_type' | 'team_id' | 'user_id'>;
type TemplateVisibilityFields = TemplateOwnerFields & Pick<TemplateRow, 'deleted_at' | 'is_public'>;

export function getTemplateSubject(template: TemplateOwnerFields, fallbackUserId: string): AuditSubject {
  if (template.owner_type === 'team' && template.team_id) {
    return { type: 'team', id: template.team_id };
  }

  return { type: 'user', id: template.user_id || fallbackUserId };
}

async function ownerGrants(
  env: Env,
  template: TemplateOwnerFields,
  userId: string,
  teamRoleGrants: (role: TeamRole) => boolean,
): Promise<boolean> {
  if (template.owner_type === 'team' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? teamRoleGrants(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

export async function canViewTemplate(env: Env, template: TemplateVisibilityFields, userId: string | null): Promise<boolean> {
  if (template.deleted_at) return false;
  if (template.is_public === true) return true;
  if (!userId) return false;
  return canViewPrivateTemplate(env, template, userId);
}

export function canViewPrivateTemplate(env: Env, template: TemplateOwnerFields, userId: string): Promise<boolean> {
  return ownerGrants(env, template, userId, canViewTeam);
}

export async function serializeTemplateForViewer<T extends TemplateRowColumns & TemplateVisibilityFields>(
  env: Env,
  row: T,
  userId: string | null,
) {
  if (row.deleted_at) return null;
  if (userId && (await canViewPrivateTemplate(env, row, userId))) return parseTemplateRow(row);
  return row.is_public === true ? toPublicTemplate(parseTemplateRow(row)) : null;
}

export function canEditTemplate(env: Env, template: TemplateOwnerFields, userId: string): Promise<boolean> {
  return ownerGrants(env, template, userId, canEditTeamTemplates);
}

export async function assertTeamTemplateCreateAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return jsonError('Organization not found', 404);
  if (!canEditTeamTemplates(normalizeTeamRole(membership.role))) return jsonError('Forbidden', 403);
  return null;
}
