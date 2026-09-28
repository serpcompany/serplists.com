import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { DashboardEmptyState } from '@/components/dashboard/DashboardContentShell';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// Console pages act on the active context. When the teams request failed before the stored
// Organization was confirmed, show this instead of the page, so nothing is shown or created
// in Personal while the user believes they are in their Organization.
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { retryWorkspace, selectWorkspace, workspaceStatus } = useWorkspace();

  if (workspaceStatus !== 'error') {
    return <>{children}</>;
  }

  return (
    <div className="px-4" data-workspace-error="true">
      <DashboardEmptyState
        icon={<AlertTriangle className="h-7 w-7" />}
        title="Couldn't load your Organizations"
        description="Your Organization opens once they load. Check your connection and try again, or continue in Personal."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={retryWorkspace}>
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={() => selectWorkspace('personal')}>
              Continue in Personal
            </Button>
          </div>
        }
      />
    </div>
  );
}
