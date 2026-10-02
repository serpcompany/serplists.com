type ApiTemplateRecord = Record<string, unknown>;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

export const readApiTemplateTeamId = (
  template: ApiTemplateRecord,
): string | undefined => {
  if (typeof template.owner_type === 'string' && template.owner_type !== 'team') {
    return undefined;
  }

  return nonEmptyString(template.team_id) ?? nonEmptyString(template.teamId);
};
