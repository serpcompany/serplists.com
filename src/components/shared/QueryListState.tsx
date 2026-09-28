import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { getListQueryStatus, hasListRefreshError } from '@/lib/queryState';
import { cn } from '@/lib/utils';

type QueryErrorNoticeProps = {
  className?: string;
  message: string;
  onRetry: () => void;
};

export function QueryErrorNotice({ className, message, onRetry }: QueryErrorNoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground',
        className,
      )}
    >
      <span>{message}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

type QueryListStateProps = {
  // The rendered list, shown only once the query has loaded a non-empty list.
  children: ReactNode;
  empty: ReactNode;
  loadErrorLabel: string;
  loadingLabel: string;
  query: { data: readonly unknown[] | undefined; isError: boolean; isLoading: boolean };
  refreshErrorLabel: string;
  onRetry: () => void;
};

// Renders a query-backed list: loading, a load error with Retry, the empty state only
// for a loaded empty list, or the list. A failed refresh keeps the last loaded list.
export function QueryListState({
  children,
  empty,
  loadErrorLabel,
  loadingLabel,
  query,
  refreshErrorLabel,
  onRetry,
}: QueryListStateProps) {
  const status = getListQueryStatus(query);

  if (status === 'idle') return null;
  if (status === 'loading') return <div className="text-sm text-muted-foreground">{loadingLabel}</div>;
  if (status === 'error') return <QueryErrorNotice message={loadErrorLabel} onRetry={onRetry} />;

  return (
    <>
      {hasListRefreshError(query) ? <QueryErrorNotice message={refreshErrorLabel} onRetry={onRetry} /> : null}
      {status === 'empty' ? empty : children}
    </>
  );
}
