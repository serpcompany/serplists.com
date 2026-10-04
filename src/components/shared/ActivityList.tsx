import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { HISTORY_DISPLAY_LIMIT, HISTORY_FULL_LIMIT } from '@/lib/schemas/historyLimits';

export type ActivityEntry = {
  actor: string;
  key: string;
  label: string;
  time: string;
};

export type ActivityViewAll = {
  onViewAll: () => void;
  showingAll: boolean;
};

export function ActivityRows({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ItemGroup aria-label="Activity" className="gap-0 divide-y">
      {entries.map((entry) => (
        <Item key={entry.key} className="rounded-none px-0 first:pt-0 last:pb-0" role="listitem" size="sm">
          <ItemContent className="min-w-0">
            <ItemTitle className="line-clamp-none">{entry.label}</ItemTitle>
            <ItemDescription className="wrap-anywhere">{entry.actor}</ItemDescription>
          </ItemContent>
          <ItemActions className="basis-full text-xs text-muted-foreground sm:basis-auto">
            <time>{entry.time}</time>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ViewAllFooter({ entryCount, viewAll }: { entryCount: number; viewAll: ActivityViewAll }) {
  if (!viewAll.showingAll) {
    return entryCount >= HISTORY_DISPLAY_LIMIT ? (
      <Button className="self-start" onClick={viewAll.onViewAll} size="sm" variant="outline">
        View all activity
      </Button>
    ) : null;
  }
  return entryCount >= HISTORY_FULL_LIMIT ? (
    <p className="text-xs text-muted-foreground">Showing the latest {HISTORY_FULL_LIMIT} entries.</p>
  ) : null;
}

type ActivityListProps = {
  emptyLabel: string;
  entries: ActivityEntry[];
  errorLabel: string;
  isError?: boolean;
  isLoading?: boolean;
  loadingLabel: string;
  viewAll?: ActivityViewAll | undefined;
};

export function ActivityList({
  emptyLabel,
  entries,
  errorLabel,
  isError = false,
  isLoading = false,
  loadingLabel,
  viewAll,
}: ActivityListProps) {
  if (isLoading && entries.length === 0) return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  if (isError) return <p className="text-sm text-muted-foreground">{errorLabel}</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ActivityRows entries={entries} />
      {viewAll ? <ViewAllFooter entryCount={entries.length} viewAll={viewAll} /> : null}
    </div>
  );
}
