import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import type { TemplateOwner } from '@/lib/schemas/templateOwner';

type ApiTemplateOwner = Pick<ApiTemplate, 'owner_type' | 'team_id' | 'teamId'>;
type ApiTemplateOwnerFields = ApiTemplateOwner &
  Pick<ApiTemplate, 'owner' | 'user_id' | 'owner_username' | 'owner_full_name'>;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

export const readApiTemplateTeamId = (
  template: ApiTemplateOwner,
): string | undefined => {
  if (typeof template.owner_type === 'string' && template.owner_type !== 'team') {
    return undefined;
  }

  return nonEmptyString(template.team_id) ?? nonEmptyString(template.teamId);
};

export const readApiTemplateOwner = (
  template: ApiTemplateOwnerFields,
): TemplateOwner | undefined => {
  if (template.owner) return template.owner;

  const teamId = readApiTemplateTeamId(template);
  if (teamId) return { type: 'team', teamId, publicHandle: null, displayName: null };
  if (template.owner_type === 'team') return undefined;

  const userId = nonEmptyString(template.user_id);
  return userId
    ? {
        type: 'user',
        userId,
        publicHandle: template.owner_username ?? null,
        displayName: template.owner_full_name ?? null,
      }
    : undefined;
};
