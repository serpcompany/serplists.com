import { QueryListState } from '@/components/shared/QueryListState';
import {
  formatActivityTime,
  formatTeamActivityAction,
  getActivityActorName,
} from '@/features/teams/teamActivityFormat';
import type { TeamActivityEvent } from '@/lib/api';

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
          {(query.data ?? []).map((event) => (
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
