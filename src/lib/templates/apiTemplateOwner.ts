import type { ApiTemplate } from '@/lib/schemas/apiTemplates';

type ApiTemplateOwner = Pick<ApiTemplate, 'owner_type' | 'team_id' | 'teamId'>;

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
