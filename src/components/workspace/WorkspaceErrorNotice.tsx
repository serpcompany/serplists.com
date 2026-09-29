import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkspaceErrorActions = {
  onContinueInPersonal: () => void;
  onRetry: () => void;
};

// The inline form of WorkspaceGate, for a page outside the console that acts in the
// active context: the teams request failed before the stored Organization was confirmed,
// so the page's actions wait, and this says why and offers the gate's way out. A page about
// an Organization's own resource (a run or Template) leaves out Continue in Personal, which
// would not change that resource's Organization.
export function WorkspaceErrorNotice({
  className,
  id,
  message,
  onContinueInPersonal,
  onRetry,
}: Pick<WorkspaceErrorActions, 'onRetry'> &
  Partial<Pick<WorkspaceErrorActions, 'onContinueInPersonal'>> & {
    className?: string;
    id: string;
    message: string;
  }) {
  return (
    <Alert
      className={cn('border-destructive/40 bg-card shadow-none', className)}
      data-workspace-error="true"
      id={id}
      variant="destructive"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Couldn&apos;t load your Organizations</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onRetry} size="sm" type="button">
            Retry
          </Button>
          {onContinueInPersonal ? (
            <Button onClick={onContinueInPersonal} size="sm" type="button" variant="outline">
              Continue in Personal
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
