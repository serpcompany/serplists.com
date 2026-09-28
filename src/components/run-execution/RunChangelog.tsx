import { History } from 'lucide-react';

import type { TemplateHistoryEvent } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';
import type { RunExecutionHistoryState } from '@/features/run-execution/useRunExecutionModel';

const runHistoryActionLabels: Record<string, string> = {
  'checklist_run.created': 'Created run',
  'checklist_run.updated': 'Updated run',
  'checklist_run.deleted': 'Archived run',
  'checklist_run.reconciled': 'Updated from Template',
  'checklist_run.revalidated': 'Revalidated against Template',
};

const formatRunHistoryAction = (action: string): string =>
  runHistoryActionLabels[action] ?? action;

const formatRunHistoryTime = (value?: string): string => {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getRunHistoryActorName = (entry: TemplateHistoryEvent): string => {
  const humanName = entry.actor?.name || entry.actor?.username || entry.actor?.email || 'Unknown user';
  const metadata = entry.metadata;

  if (
    isRecord(metadata)
    && metadata.source === 'mcp'
    && typeof metadata.personalRunKeyName === 'string'
    && metadata.personalRunKeyName.trim()
  ) {
    return `${metadata.personalRunKeyName.trim()} via MCP · authorized by ${humanName}`;
  }

  return humanName;
};

interface RunChangelogProps {
  history: RunExecutionHistoryState | undefined;
}

export function RunChangelog({ history }: RunChangelogProps): JSX.Element {
  const entries = (history?.data?.events ?? []).slice(0, HISTORY_DISPLAY_LIMIT);

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
        ) : entries.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {formatRunHistoryAction(entry.action)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getRunHistoryActorName(entry)}
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
