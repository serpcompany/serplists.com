import { History } from 'lucide-react';

import { ActivityList } from '@/components/shared/ActivityList';
import { formatAuditAction, getAuditActorName, RUN_HISTORY_LABELS } from '@/lib/auditLabels';
import { selectRunHistoryPreview } from '@/features/run-execution/runHistory';
import type { RunExecutionHistoryState } from '@/features/run-execution/useRunExecutionModel';

const formatRunHistoryTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export function RunHistorySection({ history }: { history?: RunExecutionHistoryState }) {
  const runHistoryEntries = selectRunHistoryPreview(history?.data, history?.showingAll);

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <History aria-hidden="true" className="size-4 text-muted-foreground" />
        Activity
      </h2>
      <ActivityList
        emptyLabel="No run history has been recorded yet."
        entries={runHistoryEntries.map((entry) => ({
          actor: getAuditActorName(entry.actor, entry.metadata),
          key: entry.id,
          label: formatAuditAction(RUN_HISTORY_LABELS, entry.action),
          time: formatRunHistoryTime(entry.createdAt),
        }))}
        errorLabel="Run history is unavailable right now."
        isError={Boolean(history?.isError)}
        isLoading={Boolean(history?.isLoading)}
        loadingLabel="Loading run history..."
        viewAll={history ? { onViewAll: history.onViewAll, showingAll: history.showingAll } : undefined}
      />
    </section>
  );
}
