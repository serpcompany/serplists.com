import type { ChecklistTemplate } from '@/types/checklist';

// Where a Run or a copy of a Template goes. A private Organization Template's content never
// leaves its Organization, and the detail page opens it from any context, so its Runs and
// copies go to that Organization. Anything else goes to the active context
// (docs/design-docs/organizations.md).
export const resolveTemplateDestinationTeamId = (
  template: Pick<ChecklistTemplate, 'isPublic' | 'teamId'>,
  activeTeamId: string | undefined,
): string | undefined => (template.teamId && !template.isPublic ? template.teamId : activeTeamId);

// Names the Organization a Run or copy went to when that is not the active context, so the
// success message tells the user where to find it. Undefined when it went to the active context.
export const nameOtherTemplateDestination = (
  template: Pick<ChecklistTemplate, 'isPublic' | 'teamId'>,
  activeTeamId: string | undefined,
  teams: readonly { id: string; name: string }[] | undefined,
): string | undefined => {
  const destinationTeamId = resolveTemplateDestinationTeamId(template, activeTeamId);
  if (!destinationTeamId || destinationTeamId === activeTeamId) return undefined;
  return teams?.find((team) => team.id === destinationTeamId)?.name ?? "the template's Organization";
};

export const getRunStartedMessage = (otherOrganization: string | undefined): string =>
  otherOrganization ? `Run started in ${otherOrganization}` : 'Checklist run created';

export const getTemplateDuplicatedMessage = (otherOrganization: string | undefined): string =>
  otherOrganization ? `Template duplicated in ${otherOrganization}` : 'Template duplicated';
