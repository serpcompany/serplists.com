import type {
  AuditAction,
  RunAuditAction,
  TemplateHistoryAction,
} from '@/lib/schemas/auditActions';

// Labels for audit actions in each history view. Each map is typed by the actions that view
// can show, so an action added to src/lib/schemas/auditActions.ts fails type-checking until
// it has a label here.

export const RUN_HISTORY_LABELS: Record<RunAuditAction, string> = {
  'checklist_run.created': 'Created run',
  'checklist_run.updated': 'Updated run',
  'checklist_run.deleted': 'Archived run',
  'checklist_run.restored': 'Restored run',
  'checklist_run.revalidated': 'Revalidated run',
  'checklist_run.share_created': 'Created share link',
  'checklist_run.shared_updated': 'Updated via shared link',
};

export const TEMPLATE_HISTORY_LABELS: Record<TemplateHistoryAction, string> = {
  'template.created': 'Created template',
  'template.updated': 'Updated template',
  'template.imported': 'Imported template',
  'template.cloned': 'Copied template',
  'template.deleted': 'Archived template',
  'template.restored': 'Restored template',
  'template.versioned': 'Saved template version',
};

// Organization activity lists every event whose subject is the Organization.
export const ORGANIZATION_ACTIVITY_LABELS: Record<AuditAction, string> = {
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
  'team_invite.revoked': 'Invite revoked',
  'team_member.updated': 'Member updated',
  'template.cloned': 'Template cloned',
  'template.created': 'Template created',
  'template.deleted': 'Template archived',
  'template.imported': 'Template imported',
  'template.restored': 'Template restored',
  'template.updated': 'Template updated',
};

// 'checklist_run.share_revoked' -> 'Share revoked'.
const humanizeAuditAction = (action: string): string => {
  const words = (action.split('.').pop() ?? action).replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
};

// The API returns the stored action as a string, so rows written before this app version
// knew an action still read as words rather than a dotted id.
export const formatAuditAction = (labels: Readonly<Record<string, string>>, action: string): string =>
  Object.prototype.hasOwnProperty.call(labels, action) ? labels[action] : humanizeAuditAction(action);

type AuditActor = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
  username?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Who made an audited change. MCP updates name the Run Key and the user who authorized it.
// A guest who edits a shared run has no account, so the event has no actor; its metadata
// says it came through the share link.
export const getAuditActorName = (
  actor: AuditActor | undefined,
  metadata: unknown,
  unknownActor = 'Unknown user',
): string => {
  const humanName = actor?.name || actor?.username || actor?.email || '';
  const details = isRecord(metadata) ? metadata : {};

  if (details.source === 'mcp' && typeof details.personalRunKeyName === 'string' && details.personalRunKeyName.trim()) {
    return `${details.personalRunKeyName.trim()} via MCP · authorized by ${humanName || unknownActor}`;
  }
  if (humanName) return humanName;
  if (!actor?.userId && details.source === 'public_share') return 'Guest via shared link';
  return unknownActor;
};
