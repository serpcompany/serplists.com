// Display text for the Organization activity list in settings.

const teamActivityActionLabels: Record<string, string> = {
  'checklist_run.created': 'Run created',
  'checklist_run.deleted': 'Run archived',
  'checklist_run.restored': 'Run restored',
  'checklist_run.share_created': 'Run share created',
  'checklist_run.share_revoked': 'Run sharing stopped',
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

export const formatTeamActivityAction = (action: string): string =>
  teamActivityActionLabels[action] ?? action;

export const formatActivityTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const getActivityActorName = (actor: {
  email?: string | null;
  name?: string | null;
  username?: string | null;
  userId?: string | null;
}): string => actor.name || actor.username || actor.email || actor.userId || 'Unknown user';
