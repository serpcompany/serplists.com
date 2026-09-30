import type { ReactNode } from 'react';
import { FileText, ListChecks, RotateCcw } from 'lucide-react';

import { DashboardPageHeader } from '@/components/dashboard/DashboardContentShell';
import { ListLoadErrorState } from '@/components/dashboard/ListLoadErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
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

// One kind of archived item: a Card with the list's title and count, and a row per item.
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
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {state === 'loaded' ? (
          <CardAction>
            <Badge variant="secondary">{items.length}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent>
        {state === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading {listName}...</p>
        ) : state === 'error' ? (
          <ListLoadErrorState error={error} listName={listName} onRetry={onRetry} titleAs="h3" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ItemGroup className="gap-0 divide-y">
            {items.map((item) => {
              const restoring = restoringIds.has(item.id);

              return (
                <Item key={item.id} className="rounded-none px-0" role="listitem" size="sm">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="line-clamp-2 wrap-anywhere">{item.title}</ItemTitle>
                    <ItemDescription>Archived {formatArchiveDate(item.archivedAt)}</ItemDescription>
                  </ItemContent>
                  {canRestore ? (
                    <ItemActions>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={restoring}
                        onClick={() => onRestore(item)}
                      >
                        <RotateCcw data-icon="inline-start" />
                        {restoring ? 'Restoring...' : 'Restore'}
                      </Button>
                    </ItemActions>
                  ) : null}
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

// The Archive page's content: its header, with the number of archived items once both lists
// have loaded, and the archived Templates and Runs of the active context.
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
    <section className="flex flex-col gap-6" data-archive-recovery-section="true">
      <DashboardPageHeader
        title="Archive"
        description="Archived templates and runs. Restore one to put it back in your list."
        meta={badge ? <Badge variant="outline">{badge}</Badge> : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ArchiveList
          title="Archived templates"
          canRestore={canRestoreTemplates}
          listName="archived templates"
          emptyLabel="No archived templates"
          error={templatesError}
          state={templatesState}
          icon={<FileText aria-hidden="true" className="size-4 text-muted-foreground" />}
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
          icon={<ListChecks aria-hidden="true" className="size-4 text-muted-foreground" />}
          items={archivedRuns}
          restoringIds={restoringIds}
          onRestore={(item) => void restore(item)}
          onRetry={refetchRuns}
        />
      </div>
    </section>
  );
}
