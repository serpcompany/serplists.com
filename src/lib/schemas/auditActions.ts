export const RUN_AUDIT_ACTIONS = [
  'checklist_run.created',
  'checklist_run.updated',
  'checklist_run.deleted',
  'checklist_run.restored',
  'checklist_run.revalidated',
  'checklist_run.reconciled',
  'checklist_run.share_created',
  'checklist_run.share_revoked',
  'checklist_run.shared_updated',
] as const;

export const TEMPLATE_AUDIT_ACTIONS = [
  'template.created',
  'template.updated',
  'template.imported',
  'template.cloned',
  'template.deleted',
  'template.restored',
] as const;

export const ORGANIZATION_AUDIT_ACTIONS = [
  'team.created',
  'team.updated',
  'team.owner_transferred',
  'team_invite.created',
  'team_invite.accepted',
  'team_invite.declined',
  'team_invite.link_reissued',
  'team_invite.revoked',
  'team_member.left',
  'team_member.updated',
] as const;

export const AUDIT_ACTIONS = [
  ...RUN_AUDIT_ACTIONS,
  ...TEMPLATE_AUDIT_ACTIONS,
  ...ORGANIZATION_AUDIT_ACTIONS,
] as const;

export const TEMPLATE_VERSION_ACTIONS = [
  'template.created',
  'template.updated',
  'template.imported',
  'template.cloned',
] as const;

export type RunAuditAction = (typeof RUN_AUDIT_ACTIONS)[number];
export type TemplateAuditAction = (typeof TEMPLATE_AUDIT_ACTIONS)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type TemplateVersionAction = (typeof TEMPLATE_VERSION_ACTIONS)[number];

type TemplateVersionWithoutChangeSummary = 'template.versioned';
export type TemplateHistoryAction = TemplateAuditAction | TemplateVersionWithoutChangeSummary;
