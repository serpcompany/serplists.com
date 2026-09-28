// Every action the API writes to audit_events, shared by the API and the app.
// buildAuditEventValues only accepts these, and the app's activity labels are
// typed against the list, so a new action cannot ship without a label.
// Never rename an entry: stored rows keep the string they were written with.
export const AUDIT_ACTIONS = [
  'checklist_run.created',
  'checklist_run.deleted',
  'checklist_run.restored',
  'checklist_run.revalidated',
  'checklist_run.share_created',
  'checklist_run.shared_updated',
  'checklist_run.updated',
  'team.created',
  'team.owner_transferred',
  'team.updated',
  'team_invite.accepted',
  'team_invite.created',
  'team_invite.declined',
  'team_invite.link_reissued',
  'team_invite.revoked',
  'team_member.left',
  'team_member.updated',
  'template.cloned',
  'template.created',
  'template.deleted',
  'template.imported',
  'template.restored',
  'template.updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
