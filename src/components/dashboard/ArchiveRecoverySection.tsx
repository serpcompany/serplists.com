import type { ReactNode } from 'react';
import { FileText, ListChecks, RotateCcw } from 'lucide-react';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { Button } from '@/components/ui/button';
import type { ArchiveItem, ArchiveListState } from '@/features/archive/archiveRecovery';
import { useArchiveRecovery } from '@/features/archive/useArchiveRecovery';

function formatArchiveDate(dateString: string): string {
  if (!dateString) return 'Unknown date';

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type ArchiveListProps = {
  // False when the member's role cannot restore this kind: the items stay listed.
  canRestore: boolean;
  emptyLabel: string;
  error: unknown;
  icon: ReactNode;
  items: ArchiveItem[];
  listName: 'archived templates' | 'archived runs';
  onRestore: (item: ArchiveItem) => void;
  onRetry: () => void;
  restoringIds: ReadonlySet<string>;
  state: ArchiveListState;
  title: string;
};

function ArchiveList({
  canRestore,
  emptyLabel,
  error,
  icon,
  items,
  listName,
  onRestore,
  onRetry,
  restoringIds,
  state,
  title,
}: ArchiveListProps) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        {state === 'loaded' ? (
          <span className="text-xs font-medium text-muted-foreground">
            {items.length}
          </span>
        ) : null}
      </div>

      {state === 'loading' ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Loading {listName}...
        </div>
      ) : state === 'error' ? (
        <ListLoadErrorState error={error} listName={listName} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => {
            const restoring = restoringIds.has(item.id);

            return (
              <div
                key={item.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Archived {formatArchiveDate(item.archivedAt)}
                  </div>
                </div>
                {canRestore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoring}
                    onClick={() => onRestore(item)}
                    className="rounded-md"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {restoring ? 'Restoring...' : 'Restore'}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ArchiveRecoverySection() {
  const {
    archivedTemplates,
    archivedRuns,
    templatesState,
    runsState,
    templatesError,
    runsError,
    refetchTemplates,
    refetchRuns,
    canRestoreTemplates,
    canRestoreRuns,
    restoringIds,
    restore,
  } = useArchiveRecovery();
  const archiveCount = archivedTemplates.length + archivedRuns.length;
  const listStates = [templatesState, runsState];
  // The total counts only once both lists loaded; a failed list shows its own error.
  const badge = listStates.includes('loading')
    ? 'Loading'
    : listStates.includes('error')
      ? null
      : `${archiveCount} archived`;

  return (
    <section className="space-y-4" data-archive-recovery-section="true">
      {badge ? (
        <div className="flex justify-end">
          <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {badge}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ArchiveList
          title="Archived templates"
          canRestore={canRestoreTemplates}
          listName="archived templates"
          emptyLabel="No archived templates"
          error={templatesError}
          state={templatesState}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          items={archivedTemplates}
          restoringIds={restoringIds}
          onRestore={(item) => void restore(item)}
          onRetry={refetchTemplates}
        />
        <ArchiveList
          title="Archived runs"
          canRestore={canRestoreRuns}
          listName="archived runs"
          emptyLabel="No archived runs"
          error={runsError}
          state={runsState}
          icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
          items={archivedRuns}
          restoringIds={restoringIds}
          onRestore={(item) => void restore(item)}
          onRetry={refetchRuns}
        />
      </div>
    </section>
  );
}
