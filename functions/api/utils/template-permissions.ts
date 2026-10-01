import type { Env } from '../types';
import type { AuditSubject } from './audit';
import { jsonError } from './response';
import { canEditTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from './team-access';
import { toPublicTemplate } from './template-public';
import { parseTemplateRow } from './template-rows';

export function getTemplateSubject(template: Record<string, unknown>, fallbackUserId: string): AuditSubject {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    return { type: 'team', id: template.team_id };
  }

  return {
    type: 'user',
    id: typeof template.user_id === 'string' && template.user_id ? template.user_id : fallbackUserId,
  };
}

export async function canViewTemplate(env: Env, template: Record<string, unknown>, userId: string | null): Promise<boolean> {
  if (typeof template.deleted_at === 'string' && template.deleted_at) return false;
  if (template.is_public === true || template.is_public === 1) return true;
  if (!userId) return false;
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

export async function canViewPrivateTemplate(env: Env, template: Record<string, unknown>, userId: string): Promise<boolean> {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canViewTeam(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

export async function serializeTemplateForViewer(env: Env, row: Record<string, unknown>, userId: string | null) {
  if (typeof row.deleted_at === 'string' && row.deleted_at) return null;
  if (userId && (await canViewPrivateTemplate(env, row, userId))) return parseTemplateRow(row);
  return row.is_public === true || row.is_public === 1 ? toPublicTemplate(parseTemplateRow(row)) : null;
}

export async function canEditTemplate(env: Env, template: Record<string, unknown>, userId: string): Promise<boolean> {
  if (template.owner_type === 'team' && typeof template.team_id === 'string' && template.team_id) {
    const membership = await getActiveTeamMembership(env, template.team_id, userId);
    return membership ? canEditTeamTemplates(normalizeTeamRole(membership.role)) : false;
  }

  return template.user_id === userId;
}

export async function assertTeamTemplateCreateAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return jsonError('Organization not found', 404);
  if (!canEditTeamTemplates(normalizeTeamRole(membership.role))) return jsonError('Forbidden', 403);
  return null;
}
