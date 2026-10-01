import { AlertTriangle } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { DashboardEmptyState } from '@/components/dashboard/DashboardContentShell';
import { isAuthRequiredError } from '@/lib/api-errors';
import { buildLoginPath } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

interface ListLoadErrorStateProps {
  error: unknown;
  listName: 'templates' | 'runs' | 'archived templates' | 'archived runs';
  onRetry: () => void;
  titleAs?: 'h2' | 'h3';
}

export function ListLoadErrorState({ error, listName, onRetry, titleAs }: ListLoadErrorStateProps) {
  const signedOut = isAuthRequiredError(error);

  return (
    <DashboardEmptyState
      icon={<AlertTriangle />}
      title={`Couldn't load your ${listName}`}
      titleAs={titleAs}
      description={
        signedOut
          ? 'Your session has ended. Sign in again to continue.'
          : 'Something went wrong while loading. Check your connection and try again.'
      }
      action={
        signedOut ? (
          <Link href={buildLoginPath()} className={buttonVariants()}>Sign in</Link>
        ) : (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}
