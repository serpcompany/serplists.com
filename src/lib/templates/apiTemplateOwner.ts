type ApiTemplateRecord = Record<string, unknown>;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

/**
 * The Organization that owns a template row from the API, or undefined for
 * Personal. Every API-to-ChecklistTemplate mapper uses this, so permission checks
 * that compare teamId see the same value wherever the template was loaded from.
 * Matches the server: a row is Organization-owned only with owner_type 'team'
 * (when the row says) and a team_id. Personal rows have team_id null.
 */
export const readApiTemplateTeamId = (
  template: ApiTemplateRecord,
): string | undefined => {
  if (typeof template.owner_type === 'string' && template.owner_type !== 'team') {
    return undefined;
  }

  return nonEmptyString(template.team_id) ?? nonEmptyString(template.teamId);
};
