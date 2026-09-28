import { History } from 'lucide-react';

import { formatAuditAction, getAuditActorName, RUN_HISTORY_LABELS } from '@/lib/auditLabels';
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
  const runHistoryEntries = (history?.data?.events ?? []).slice(0, 8);

  return (
    <section className="border-t border-border bg-background px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Changelog
          </h2>
        </div>
        {history?.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading run history...
          </p>
        ) : history?.isError ? (
          <p className="text-sm text-muted-foreground">
            Run history is unavailable right now.
          </p>
        ) : runHistoryEntries.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {runHistoryEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {formatAuditAction(RUN_HISTORY_LABELS, entry.action)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getAuditActorName(entry.actor, entry.metadata)}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {formatRunHistoryTime(entry.createdAt)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No run history has been recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}
