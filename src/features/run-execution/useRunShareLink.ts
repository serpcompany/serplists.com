import { useState } from 'react';
import { toast } from 'sonner';

import { createShareLinkAndCopy } from '@/lib/shareLink';

import type { RunExecutionActionResult } from './runExecutionResult';

type RunShareActions = {
  createShare: () => Promise<RunExecutionActionResult>;
  stopSharing: () => Promise<RunExecutionActionResult>;
};

/**
 * The run page's share link. The link is always shown in a dialog and copying is best effort
 * (createShareLinkAndCopy). Each create replaces the share token, so reopening reuses this
 * run's link, and stopping sharing forgets it: the next Share makes a new one.
 */
export function useRunShareLink(runId: string | undefined, actions: RunShareActions) {
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareLink, setShareLink] = useState<{ runId: string; url: string } | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const createShareLink = async () => {
    if (!runId) return;
    if (shareLink?.runId === runId) {
      setIsShareDialogOpen(true);
      return;
    }

    setIsCreatingShare(true);
    try {
      const result = await createShareLinkAndCopy(async () => {
        const shared = await actions.createShare();
        if (shared.kind === 'error') throw new Error(shared.message || 'Failed to create share link for this run.');
        return shared.kind === 'ok' && shared.shareUrl ? shared.shareUrl : null;
      });
      if (result.kind === 'error') {
        toast.error(result.message);
      } else if (result.kind === 'ok') {
        setShareLink({ runId, url: result.shareUrl });
        setIsShareDialogOpen(true);
        if (result.copied) toast.success('Share link copied to clipboard');
      }
    } finally {
      setIsCreatingShare(false);
    }
  };

  const stopSharing = async () => {
    const result = await actions.stopSharing();
    if (result.kind === 'ok') setShareLink(null);
    return result;
  };

  return {
    createShareLink,
    isCreatingShare,
    isShareDialogOpen: isShareDialogOpen && shareLink?.runId === runId,
    setIsShareDialogOpen,
    shareUrl: shareLink?.url ?? '',
    stopSharing,
  };
}
