import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getListQueryStatus, hasListRefreshError } from '@/lib/queryState';

type QueryErrorNoticeProps = {
  className?: string;
  message: string;
  onRetry: () => void;
};

export function QueryErrorNotice({ className, message, onRetry }: QueryErrorNoticeProps) {
  return (
    <Alert className={className} variant="destructive">
      <AlertCircle />
      <AlertTitle>{message}</AlertTitle>
      <AlertAction>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}

type QueryListStateProps = {
  children: ReactNode;
  empty: ReactNode;
  loadErrorLabel: string;
  loadingLabel: string;
  query: { data: readonly unknown[] | undefined; isError: boolean; isLoading: boolean };
  refreshErrorLabel: string;
  onRetry: () => void;
};

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
  if (status === 'loading') return <p className="text-sm text-muted-foreground">{loadingLabel}</p>;
  if (status === 'error') return <QueryErrorNotice message={loadErrorLabel} onRetry={onRetry} />;

  return (
    <>
      {hasListRefreshError(query) ? <QueryErrorNotice message={refreshErrorLabel} onRetry={onRetry} /> : null}
      {status === 'empty' ? empty : children}
    </>
  );
}
