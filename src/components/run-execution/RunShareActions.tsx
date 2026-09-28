import { useState } from 'react';
import { Link2Off, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RunExecutionActionResult } from '@/features/run-execution/useRunExecutionModel';

type RunShareActionsProps = {
  isPublic: boolean;
  onShare: () => Promise<RunExecutionActionResult>;
  onStopSharing: () => Promise<RunExecutionActionResult>;
};

const SHARE_FAILED = 'Failed to create share link for this run.';
const STOP_FAILED = 'Unable to stop sharing this run.';

/** Share and Stop sharing on the run page. A shared run shows its state and a way to revoke the link. */
export function RunShareActions({ isPublic, onShare, onStopSharing }: RunShareActionsProps) {
  const [pending, setPending] = useState<'share' | 'stop' | null>(null);

  const run = async (action: 'share' | 'stop') => {
    setPending(action);
    try {
      const result = await (action === 'share' ? onShare() : onStopSharing());
      if (result.kind === 'error') {
        toast.error(result.message || (action === 'share' ? SHARE_FAILED : STOP_FAILED));
      } else if (result.kind === 'ok' && action === 'stop') {
        toast.success('Sharing stopped. The old link no longer works.');
      } else if (result.kind === 'ok' && result.shareUrl) {
        await navigator.clipboard.writeText(result.shareUrl);
        toast.success('Share link copied to clipboard');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : action === 'share' ? SHARE_FAILED : STOP_FAILED);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      {isPublic ? <Badge variant="secondary">Shared</Badge> : null}
      <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void run('share')}>
        <Share2 className="mr-2 h-4 w-4" />
        {pending === 'share' ? 'Creating link...' : 'Share'}
      </Button>
      {isPublic ? (
        <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void run('stop')}>
          <Link2Off className="mr-2 h-4 w-4" />
          {pending === 'stop' ? 'Stopping...' : 'Stop sharing'}
        </Button>
      ) : null}
    </>
  );
}
