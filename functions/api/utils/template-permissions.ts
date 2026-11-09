import type { schema } from '../db';
import type { Env } from '../types';
import type { AuditSubject } from './audit';
import { refusalResponse, writeRefusal, type WriteRefusal } from './write-refusal';
import { ownerGrants, type OwnershipColumns } from './owner-access';
import { canEditTeamTemplates, canViewTeam, getActiveTeamMembership, normalizeTeamRole } from './team-access';
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

const ownershipOf = (template: TemplateOwnerFields): OwnershipColumns => ({
  team_id: template.owner_type === 'team' ? template.team_id : null,
  user_id: template.user_id,
});

export async function canViewTemplate(env: Env, template: TemplateVisibilityFields, userId: string | null): Promise<boolean> {
  if (template.deleted_at) return false;
  if (template.is_public === true) return true;
  if (!userId) return false;
  return canViewPrivateTemplate(env, template, userId);
}

export function canViewPrivateTemplate(env: Env, template: TemplateOwnerFields, userId: string): Promise<boolean> {
  return ownerGrants(env, ownershipOf(template), userId, canViewTeam);
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
  return ownerGrants(env, ownershipOf(template), userId, canEditTeamTemplates);
}

export async function teamTemplateCreateRefusal(env: Env, teamId: string, userId: string): Promise<WriteRefusal | null> {
  const membership = await getActiveTeamMembership(env, teamId, userId);
  if (!membership) return writeRefusal('Organization not found', 404);
  if (!canEditTeamTemplates(normalizeTeamRole(membership.role))) return writeRefusal('Forbidden', 403);
  return null;
}

export async function assertTeamTemplateCreateAccess(env: Env, teamId: string, userId: string): Promise<Response | null> {
  const refusal = await teamTemplateCreateRefusal(env, teamId, userId);
  return refusal && refusalResponse(refusal);
}
