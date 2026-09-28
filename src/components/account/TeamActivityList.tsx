import { QueryListState } from '@/components/shared/QueryListState';
import type { TeamActivityEvent } from '@/lib/api';

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
  'team_invite.revoked': 'Invite revoked',
  'team_member.updated': 'Member updated',
  'template.cloned': 'Template cloned',
  'template.created': 'Template created',
  'template.deleted': 'Template archived',
  'template.imported': 'Template imported',
  'template.restored': 'Template restored',
  'template.updated': 'Template updated',
};

const formatTeamActivityAction = (action: string): string =>
  teamActivityActionLabels[action] ?? action;

const formatActivityTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const getActivityActorName = (actor: TeamActivityEvent['actor']): string =>
  actor.name || actor.username || actor.email || actor.userId || 'Unknown user';

type TeamActivityListProps = {
  query: { data: TeamActivityEvent[] | undefined; isError: boolean; isLoading: boolean };
  onRetry: () => void;
};

export function TeamActivityList({ query, onRetry }: TeamActivityListProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">Activity</div>
      <QueryListState
        query={query}
        loadingLabel="Loading activity..."
        loadErrorLabel="Couldn't load Organization activity."
        refreshErrorLabel="Couldn't refresh Organization activity. Showing the last loaded list."
        onRetry={onRetry}
        empty={<div className="text-sm text-muted-foreground">No Organization activity recorded yet.</div>}
      >
        <div className="divide-y rounded-md border border-border">
          {(query.data ?? []).slice(0, 10).map((event) => (
            <div
              key={event.id}
              className="grid gap-1 p-3 md:grid-cols-[minmax(0,1fr)_180px]"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {formatTeamActivityAction(event.action)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {getActivityActorName(event.actor)}
                </div>
              </div>
              <div className="text-sm text-muted-foreground md:text-right">
                {formatActivityTime(event.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </QueryListState>
    </div>
  );
}
