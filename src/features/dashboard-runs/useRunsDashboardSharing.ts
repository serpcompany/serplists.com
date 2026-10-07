import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { createShareLinkAndCopy } from '@/lib/shareLink';
import type { ChecklistRun } from '@/types/checklist';

import { createRunsDashboardShareUrl } from './shareRun';

type SharedLink = { runId: string; url: string };

const isLinkListedShared = (link: SharedLink, runs: Pick<ChecklistRun, 'id' | 'isPublic'>[]) =>
  runs.find((run) => run.id === link.runId)?.isPublic === true;

export function useRunsDashboardSharing({
  runs,
  onRunShared,
  onShareFailed,
  onStopSharingRun,
}: {
  runs: Pick<ChecklistRun, 'id' | 'isPublic'>[];
  onRunShared?: ((runId: string) => void) | undefined;
  onShareFailed?: ((error: unknown) => Promise<void>) | undefined;
  onStopSharingRun?: ((runId: string) => Promise<void>) | undefined;
}) {
  const [sharedLink, setSharedLink] = useState<SharedLink | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const sharingRunId = useRef<string | null>(null);
  const [stoppingShareRunId, setStoppingShareRunId] = useState<string | null>(null);

  const [checkedRuns, setCheckedRuns] = useState(runs);
  if (checkedRuns !== runs) {
    setCheckedRuns(runs);
    setSharedLink((current) => (current && !isLinkListedShared(current, runs) ? null : current));
  }

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
      setSharedLink((current) => (current?.runId === runId ? null : current));
      toast.success('Sharing stopped. The old link no longer works.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to stop sharing');
    } finally {
      setStoppingShareRunId(null);
    }
  };

  return {
    isShareDialogOpen: isShareDialogOpen && sharedLink !== null,
    setIsShareDialogOpen,
    sharedLink,
    shareRun,
    stopSharing,
    stoppingShareRunId,
  };
}
