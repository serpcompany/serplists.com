import type {
  AuditAction,
  RunAuditAction,
  TemplateHistoryAction,
} from '@/lib/schemas/auditActions';
import { isRecord, type JsonRecord } from '@/lib/schemas/jsonRecords';

export const RUN_HISTORY_LABELS: Record<RunAuditAction, string> = {
  'checklist_run.created': 'Created run',
  'checklist_run.updated': 'Updated run',
  'checklist_run.deleted': 'Deleted run',
  'checklist_run.restored': 'Restored run',
  'checklist_run.revalidated': 'Revalidated run',
  'checklist_run.reconciled': 'Updated from Template',
  'checklist_run.share_created': 'Created share link',
  'checklist_run.share_revoked': 'Stopped sharing',
  'checklist_run.shared_updated': 'Updated via shared link',
};

export const TEMPLATE_HISTORY_LABELS: Record<TemplateHistoryAction, string> = {
  'template.created': 'Created template',
  'template.updated': 'Updated template',
  'template.imported': 'Imported template',
  'template.cloned': 'Copied template',
  'template.deleted': 'Deleted template',
  'template.restored': 'Restored template',
  'template.transferred_to_organization': 'Transferred to Organization',
  'template.versioned': 'Saved template version',
};

export const ORGANIZATION_ACTIVITY_LABELS: Record<AuditAction, string> = {
  'checklist_run.created': 'Run created',
  'checklist_run.deleted': 'Run deleted',
  'checklist_run.restored': 'Run restored',
  'checklist_run.revalidated': 'Run revalidated',
  'checklist_run.reconciled': 'Run updated from Template',
  'checklist_run.share_created': 'Run share created',
  'checklist_run.share_revoked': 'Run sharing stopped',
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
  'template.deleted': 'Template deleted',
  'template.imported': 'Template imported',
  'template.restored': 'Template restored',
  'template.transferred_to_organization': 'Template transferred in',
  'template.updated': 'Template updated',
};

const humanizeAuditAction = (action: string): string => {
  const words = (action.split('.').pop() ?? action).replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
};

export const formatAuditAction = (labels: Readonly<Record<string, string>>, action: string): string => {
  const label = Object.prototype.hasOwnProperty.call(labels, action) ? labels[action] : undefined;
  return label ?? humanizeAuditAction(action);
};

type AuditActor = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
  username?: string | null;
};

interface ActorMetadata extends JsonRecord {
  source?: unknown;
  personalRunKeyName?: unknown;
}

export const getAuditActorName = (
  actor: AuditActor | undefined,
  metadata: unknown,
  unknownActor = 'Unknown user',
): string => {
  const humanName = actor?.name || actor?.username || actor?.email || '';
  const details: ActorMetadata = isRecord(metadata) ? metadata : {};

  if (details.source === 'mcp' && typeof details.personalRunKeyName === 'string' && details.personalRunKeyName.trim()) {
    return `${details.personalRunKeyName.trim()} via MCP · authorized by ${humanName || unknownActor}`;
  }
  if (humanName) return humanName;
  if (!actor?.userId && details.source === 'public_share') return 'Guest via shared link';
  return unknownActor;
};
