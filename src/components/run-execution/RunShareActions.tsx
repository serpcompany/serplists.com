import { useState } from 'react';
import { Link2Off, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RunExecutionActionResult } from '@/features/run-execution/useRunExecutionModel';

type RunShareActionsProps = {
  isCreatingShare: boolean;
  isPublic: boolean;
  onShare: () => void;
  onStopSharing: () => Promise<RunExecutionActionResult>;
};

const STOP_FAILED = 'Unable to stop sharing this run.';

export function RunShareActions({ isCreatingShare, isPublic, onShare, onStopSharing }: RunShareActionsProps) {
  const [isStopping, setIsStopping] = useState(false);
  const busy = isCreatingShare || isStopping;

  const stopSharing = async () => {
    setIsStopping(true);
    try {
      const result = await onStopSharing();
      if (result.kind === 'error') {
        toast.error(result.message || STOP_FAILED);
      } else if (result.kind === 'ok') {
        toast.success('Sharing stopped. The old link no longer works.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : STOP_FAILED);
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <>
      {isPublic ? <Badge variant="secondary">Shared</Badge> : null}
      <Button variant="outline" disabled={busy} onClick={onShare}>
        <Share2 data-icon="inline-start" />
        {isCreatingShare ? 'Creating link...' : 'Share'}
      </Button>
      {isPublic ? (
        <Button variant="outline" disabled={busy} onClick={() => void stopSharing()}>
          <Link2Off data-icon="inline-start" />
          {isStopping ? 'Stopping...' : 'Stop sharing'}
        </Button>
      ) : null}
    </>
  );
}
