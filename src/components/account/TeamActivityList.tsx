import { ChangelogRows } from '@/components/shared/ChangelogList';
import { QueryListState } from '@/components/shared/QueryListState';
import { formatTeamActivityAction } from '@/components/account/teamActivityLabels';
import type { TeamActivityEvent } from '@/lib/api';
import { getAuditActorName } from '@/lib/auditLabels';

type TeamActivityListProps = {
  query: { data: TeamActivityEvent[] | undefined; isError: boolean; isLoading: boolean };
  onRetry: () => void;
};

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

const getActivityActorName = (event: TeamActivityEvent): string =>
  getAuditActorName(event.actor, event.metadata, event.actor.userId || undefined);

export function TeamActivityList({ query, onRetry }: TeamActivityListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Activity</h3>
      <QueryListState
        query={query}
        loadingLabel="Loading activity..."
        loadErrorLabel="Couldn't load Organization activity."
        refreshErrorLabel="Couldn't refresh Organization activity. Showing the last loaded list."
        onRetry={onRetry}
        empty={<p className="text-sm text-muted-foreground">No Organization activity recorded yet.</p>}
      >
        <ChangelogRows
          entries={(query.data ?? []).map((event) => ({
            actor: getActivityActorName(event),
            key: event.id,
            label: formatTeamActivityAction(event.action),
            time: formatActivityTime(event.createdAt),
          }))}
        />
      </QueryListState>
    </section>
  );
}
