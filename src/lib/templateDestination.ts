import type { ChecklistTemplate } from '@/types/checklist';

// Where a Run or a copy of a Template goes. A private Organization Template's content never
// leaves its Organization, and the detail page opens it from any context, so its Runs and
// copies go to that Organization. Anything else goes to the active context
// (docs/design-docs/organizations.md).
export const resolveTemplateDestinationTeamId = (
  template: Pick<ChecklistTemplate, 'isPublic' | 'teamId'>,
  activeTeamId: string | undefined,
): string | undefined => (template.teamId && !template.isPublic ? template.teamId : activeTeamId);
