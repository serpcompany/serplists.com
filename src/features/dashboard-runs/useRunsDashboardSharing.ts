import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { createShareLinkAndCopy } from '@/lib/shareLink';

import { createRunsDashboardShareUrl } from './shareRun';

/**
 * Share and Stop sharing on the runs list. The link is always shown in a dialog; copying is
 * best effort (see createShareLinkAndCopy). Each create replaces the run's share token, so a
 * second tap waits and a reopen reuses it; stopping sharing forgets it.
 */
export function useRunsDashboardSharing({
  onRunShared,
  onStopSharingRun,
}: {
  // Called once a share has made the run public (see createRunsDashboardShareUrl).
  onRunShared?: (runId: string) => void;
  onStopSharingRun?: (runId: string) => Promise<void>;
}) {
  const [sharedLink, setSharedLink] = useState<{ runId: string; url: string } | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const sharingRunId = useRef<string | null>(null);
  const [stoppingShareRunId, setStoppingShareRunId] = useState<string | null>(null);

  const shareRun = async (runId: string) => {
    if (sharingRunId.current) {
      return;
    }
    if (sharedLink?.runId === runId) {
      setIsShareDialogOpen(true);
      return;
    }

    sharingRunId.current = runId;
    try {
      const result = await createShareLinkAndCopy(() =>
        createRunsDashboardShareUrl(runId, window.location.origin, undefined, onRunShared),
      );
      if (result.kind === 'error') {
        toast.error(result.message);
        return;
      }
      if (result.kind === 'ok') {
        setSharedLink({ runId, url: result.shareUrl });
        setIsShareDialogOpen(true);
        if (result.copied) toast.success('Share link copied');
      }
    } finally {
      sharingRunId.current = null;
    }
  };

  const stopSharing = async (runId: string) => {
    if (!onStopSharingRun) return;
    setStoppingShareRunId(runId);
    try {
      await onStopSharingRun(runId);
      // The link shown for this run no longer works: the next Share makes a new one.
      setSharedLink((current) => (current?.runId === runId ? null : current));
      toast.success('Sharing stopped. The old link no longer works.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to stop sharing');
    } finally {
      setStoppingShareRunId(null);
    }
  };

  return { isShareDialogOpen, setIsShareDialogOpen, sharedLink, shareRun, stopSharing, stoppingShareRunId };
}
