import type { AuditAction } from '@/lib/schemas/auditActions';

// Labels for Organization audit actions shown in the Activity list. Typed
// against every action the API writes, so a new one needs a label here.
const teamActivityActionLabels: Record<AuditAction, string> = {
  'checklist_run.created': 'Run created',
  'checklist_run.deleted': 'Run archived',
  'checklist_run.restored': 'Run restored',
  'checklist_run.revalidated': 'Run revalidated',
  'checklist_run.share_created': 'Run share created',
  'checklist_run.shared_updated': 'Shared run updated',
  'checklist_run.updated': 'Run updated',
  'team.created': 'Organization created',
  'team.owner_transferred': 'Owner transferred',
  'team.updated': 'Organization updated',
  'team_invite.accepted': 'Invite accepted',
  'team_invite.created': 'Invite created',
  'team_invite.declined': 'Invite declined',
  'team_invite.link_reissued': 'Invite link replaced',
  'team_invite.revoked': 'Invite revoked',
  'team_member.left': 'Member left',
  'team_member.updated': 'Member updated',
  'template.cloned': 'Template cloned',
  'template.created': 'Template created',
  'template.deleted': 'Template archived',
  'template.imported': 'Template imported',
  'template.restored': 'Template restored',
  'template.updated': 'Template updated',
};

// Product names for the resource part of an action (docs/PRODUCT_SENSE.md).
const resourceNames: Record<string, string> = {
  checklist_run: 'Run',
  team: 'Organization',
  team_invite: 'Invite',
  team_member: 'Member',
  template: 'Template',
};

const isKnownAction = (action: string): action is AuditAction =>
  Object.prototype.hasOwnProperty.call(teamActivityActionLabels, action);

// Rows written by an older or newer deploy can hold an action this build does
// not know; show it as words rather than a dotted id.
const humanizeAction = (action: string): string => {
  const [resource = '', ...verbParts] = action.split('.');
  const words = [resourceNames[resource] ?? resource, ...verbParts]
    .join(' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
};

export const formatTeamActivityAction = (action: string): string =>
  isKnownAction(action) ? teamActivityActionLabels[action] : humanizeAction(action);
