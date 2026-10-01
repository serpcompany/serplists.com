import { ORGANIZATION_ACTIVITY_LABELS } from '@/lib/auditLabels';
import type { AuditAction } from '@/lib/schemas/auditActions';

const resourceProductNames: Record<string, string> = {
  checklist_run: 'Run',
  team: 'Organization',
  team_invite: 'Invite',
  team_member: 'Member',
  template: 'Template',
};

const humanizeAction = (action: string): string => {
  const [resource = '', ...verbParts] = action.split('.');
  const words = [resourceProductNames[resource] ?? resource, ...verbParts]
    .join(' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
};

const isKnownAction = (action: string): action is AuditAction =>
  Object.prototype.hasOwnProperty.call(ORGANIZATION_ACTIVITY_LABELS, action);

export const formatTeamActivityAction = (action: string): string =>
  isKnownAction(action) ? ORGANIZATION_ACTIVITY_LABELS[action] : humanizeAction(action);
