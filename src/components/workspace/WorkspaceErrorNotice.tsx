import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type WorkspaceErrorActions = {
  onContinueInPersonal: () => void;
  onRetry: () => void;
};

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
      className={className}
      data-workspace-error="true"
      id={id}
      variant="destructive"
    >
      <AlertTriangle />
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
