import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DashboardEmptyState } from '@/components/dashboard/DashboardContentShell';
import { isAuthRequiredError } from '@/lib/api-errors';

import { Link } from '@/components/navigation/Link';

interface ListLoadErrorStateProps {
  error: unknown;
  listName: 'templates' | 'runs' | 'archived templates' | 'archived runs';
  onRetry: () => void;
}

// Shown in place of an empty list when the list failed to load, so a failed request never
// reads as "you have nothing here".
export function ListLoadErrorState({ error, listName, onRetry }: ListLoadErrorStateProps) {
  const signedOut = isAuthRequiredError(error);

  return (
    <DashboardEmptyState
      icon={<AlertTriangle className="h-7 w-7" />}
      title={`Couldn't load your ${listName}`}
      description={
        signedOut
          ? 'Your session has ended. Sign in again to continue.'
          : 'Something went wrong while loading. Check your connection and try again.'
      }
      action={
        signedOut ? (
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        ) : (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}
