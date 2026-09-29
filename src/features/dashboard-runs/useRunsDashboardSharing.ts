import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { createShareLinkAndCopy } from '@/lib/shareLink';
import type { ChecklistRun } from '@/types/checklist';

import { createRunsDashboardShareUrl } from './shareRun';

type SharedLink = { runId: string; url: string };

// A link is reused only while the list shows its run shared. Another tab or a teammate may
// have stopped sharing it (the list refetches), which killed the link.
const isLinkListedShared = (link: SharedLink, runs: Pick<ChecklistRun, 'id' | 'isPublic'>[]) =>
  runs.find((run) => run.id === link.runId)?.isPublic === true;

/**
 * Share and Stop sharing on the runs list. The link is always shown in a dialog; copying is
 * best effort (see createShareLinkAndCopy). Each create replaces the run's share token, so a
 * second tap waits and a reopen reuses it while the list shows the run shared; stopping
 * sharing, or a refreshed list that shows the run private or no longer lists it, forgets it.
 */
export function useRunsDashboardSharing({
  runs,
  onRunShared,
  onShareFailed,
  onStopSharingRun,
}: {
  runs: Pick<ChecklistRun, 'id' | 'isPublic'>[];
  // Called once a share has made the run public (see createRunsDashboardShareUrl).
  onRunShared?: (runId: string) => void;
  // Awaited before a refused share shows its error (refreshAfterShareFailure).
  onShareFailed?: (error: unknown) => Promise<void>;
  onStopSharingRun?: (runId: string) => Promise<void>;
}) {
  const [sharedLink, setSharedLink] = useState<SharedLink | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const sharingRunId = useRef<string | null>(null);
  const [stoppingShareRunId, setStoppingShareRunId] = useState<string | null>(null);

  // Checked only when the list itself changes, so a link made before the list catches up
  // with the share (markRunShared marks the run public in it) is kept.
  useEffect(() => {
    setSharedLink((current) => (current && !isLinkListedShared(current, runs) ? null : current));
  }, [runs]);

  const shareRun = async (runId: string) => {
    if (sharingRunId.current) {
      return;
    }
    if (sharedLink?.runId === runId && isLinkListedShared(sharedLink, runs)) {
      setIsShareDialogOpen(true);
      return;
    }

    sharingRunId.current = runId;
    try {
      const result = await createShareLinkAndCopy(() =>
        createRunsDashboardShareUrl(runId, window.location.origin, undefined, onRunShared, onShareFailed),
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

  return {
    // A forgotten link closes its dialog rather than showing an empty one.
    isShareDialogOpen: isShareDialogOpen && sharedLink !== null,
    setIsShareDialogOpen,
    sharedLink,
    shareRun,
    stopSharing,
    stoppingShareRunId,
  };
}
