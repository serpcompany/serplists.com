import { ORGANIZATION_ACTIVITY_LABELS } from '@/lib/auditLabels';
import type { AuditAction } from '@/lib/schemas/auditActions';

// Product names for the resource part of an action (docs/PRODUCT_SENSE.md).
const resourceNames: Record<string, string> = {
  checklist_run: 'Run',
  team: 'Organization',
  team_invite: 'Invite',
  team_member: 'Member',
  template: 'Template',
};

// Rows written by an older or newer deploy can hold an action this build does
// not know; show it as words rather than a dotted id. Organization activity mixes
// Runs, Templates and Invites, so the words keep the resource's product name.
const humanizeAction = (action: string): string => {
  const [resource = '', ...verbParts] = action.split('.');
  const words = [resourceNames[resource] ?? resource, ...verbParts]
    .join(' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
};

const isKnownAction = (action: string): action is AuditAction =>
  Object.prototype.hasOwnProperty.call(ORGANIZATION_ACTIVITY_LABELS, action);

// The label for an action in the Organization Activity list. The labels live in
// src/lib/auditLabels.ts, typed by every action the API writes.
export const formatTeamActivityAction = (action: string): string =>
  isKnownAction(action) ? ORGANIZATION_ACTIVITY_LABELS[action] : humanizeAction(action);
