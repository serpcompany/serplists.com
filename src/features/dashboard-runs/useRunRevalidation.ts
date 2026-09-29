import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { getRevalidateRunErrorMessage } from '@/lib/editConflicts';
import type { ChecklistRun } from '@/types/checklist';

/**
 * Revalidate on the runs list. Several runs can revalidate at once, so each run is busy
 * until its own request (and the list refresh it awaits) finishes: a second request for
 * the same run would carry the same revision, and the API refuses one of the two with
 * 409 edit_conflict. The ref blocks a repeat before React re-renders; the state disables
 * that run's button. Follows useArchiveRecovery's restoringIds.
 */
export function useRunRevalidation(onRevalidateRun?: (run: ChecklistRun) => void | Promise<void>) {
  const pendingRef = useRef(new Set<string>());
  const [revalidatingIds, setRevalidatingIds] = useState<ReadonlySet<string>>(() => new Set());

  const revalidate = async (run: ChecklistRun) => {
    if (!onRevalidateRun || pendingRef.current.has(run.id)) return;
    pendingRef.current.add(run.id);
    setRevalidatingIds((ids) => new Set(ids).add(run.id));
    try {
      await onRevalidateRun(run);
      toast.success('Run revalidated against the latest template');
    } catch (error) {
      toast.error(getRevalidateRunErrorMessage(error));
    } finally {
      pendingRef.current.delete(run.id);
      setRevalidatingIds((ids) => {
        const next = new Set(ids);
        next.delete(run.id);
        return next;
      });
    }
  };

  return { isRevalidating: (runId: string) => revalidatingIds.has(runId), revalidate };
}
