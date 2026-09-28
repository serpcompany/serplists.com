import type { ReactNode } from 'react';
import { FileText, ListChecks, RotateCcw } from 'lucide-react';

import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { Button } from '@/components/ui/button';
import type { ArchiveItem } from '@/features/archive/archiveRecovery';
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
  emptyLabel: string;
  error: unknown;
  icon: ReactNode;
  items: ArchiveItem[];
  listName: 'archived templates' | 'archived runs';
  onRestore: (item: ArchiveItem) => void;
  onRetry: () => void;
  restoringIds: ReadonlySet<string>;
  title: string;
};

function ArchiveList({
  emptyLabel,
  error,
  icon,
  items,
  listName,
  onRestore,
  onRetry,
  restoringIds,
  title,
}: ArchiveListProps) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        <span className="text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>

      {error ? (
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
    templatesError,
    runsError,
    refetchTemplates,
    refetchRuns,
    isLoading,
    restoringIds,
    restore,
  } = useArchiveRecovery();
  const archiveCount = archivedTemplates.length + archivedRuns.length;

  return (
    <section className="space-y-4" data-archive-recovery-section="true">
      <div className="flex justify-end">
        <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {isLoading ? 'Loading' : `${archiveCount} archived`}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ArchiveList
          title="Archived templates"
          listName="archived templates"
          emptyLabel="No archived templates"
          error={templatesError}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          items={archivedTemplates}
          restoringIds={restoringIds}
          onRestore={(item) => void restore(item)}
          onRetry={refetchTemplates}
        />
        <ArchiveList
          title="Archived runs"
          listName="archived runs"
          emptyLabel="No archived runs"
          error={runsError}
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
