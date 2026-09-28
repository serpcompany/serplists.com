// Labels for Organization audit actions shown in the Activity list.
const teamActivityActionLabels: Record<string, string> = {
  'checklist_run.created': 'Run created',
  'checklist_run.deleted': 'Run archived',
  'checklist_run.restored': 'Run restored',
  'checklist_run.share_created': 'Run share created',
  'checklist_run.shared_updated': 'Shared run updated',
  'checklist_run.updated': 'Run updated',
  'team.created': 'Organization created',
  'team.owner_transferred': 'Owner transferred',
  'team.updated': 'Organization updated',
  'team_invite.accepted': 'Invite accepted',
  'team_invite.created': 'Invite created',
  'team_invite.declined': 'Invite declined',
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

export const formatTeamActivityAction = (action: string): string =>
  teamActivityActionLabels[action] ?? action;
