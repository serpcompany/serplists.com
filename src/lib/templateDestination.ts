import type { ChecklistTemplate } from '@/types/checklist';

export const resolveTemplateDestinationTeamId = (
  template: Pick<ChecklistTemplate, 'isPublic' | 'teamId'>,
  activeTeamId: string | undefined,
): string | undefined => (template.teamId && !template.isPublic ? template.teamId : activeTeamId);

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
