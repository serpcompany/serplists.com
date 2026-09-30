import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';

export type ChangelogEntry = {
  // Who made the change.
  actor: string;
  key: string;
  label: string;
  // When, as the page formats it.
  time: string;
};

// History rows, newest first: what changed and who changed it, with the time on the right
// (under them on phones).
export function ChangelogRows({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <ItemGroup className="gap-0 divide-y">
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

type ChangelogListProps = {
  emptyLabel: string;
  entries: ChangelogEntry[];
  errorLabel: string;
  isError?: boolean;
  isLoading?: boolean;
  loadingLabel: string;
};

// A record's history with its loading, error and empty lines: template detail's and the run
// page's Changelog.
export function ChangelogList({
  emptyLabel,
  entries,
  errorLabel,
  isError = false,
  isLoading = false,
  loadingLabel,
}: ChangelogListProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  if (isError) return <p className="text-sm text-muted-foreground">{errorLabel}</p>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return <ChangelogRows entries={entries} />;
}
