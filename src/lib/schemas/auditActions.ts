// Every audit_events.action the API writes, shared by the API and the app.
// AuditEventInput.action (functions/api/utils/audit.ts) takes only these, and the history
// label maps (src/lib/auditLabels.ts) are typed by them, so a new action cannot ship
// without a label in each history view.
// Never rename an entry: stored rows keep the string they were written with.

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

// The change summary stored on a template version (template_versions.change_summary).
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
// The Template history reads a version with no change summary as 'template.versioned'.
export type TemplateHistoryAction = TemplateAuditAction | 'template.versioned';
