import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { getRevalidateRunErrorMessage } from '@/lib/editConflicts';
import type { ChecklistRun } from '@/types/checklist';

export function useRunRevalidation(onRevalidateRun?: (run: ChecklistRun) => void | Promise<void>) {
  const revalidatingIdsRef = useRef(new Set<string>());
  const [revalidatingIds, setRevalidatingIds] = useState<ReadonlySet<string>>(() => new Set());

  const revalidate = async (run: ChecklistRun) => {
    if (!onRevalidateRun || revalidatingIdsRef.current.has(run.id)) return;
    revalidatingIdsRef.current.add(run.id);
    setRevalidatingIds((ids) => new Set(ids).add(run.id));
    try {
      await onRevalidateRun(run);
      toast.success('Run revalidated against the latest template');
    } catch (error) {
      toast.error(getRevalidateRunErrorMessage(error));
    } finally {
      revalidatingIdsRef.current.delete(run.id);
      setRevalidatingIds((ids) => {
        const next = new Set(ids);
        next.delete(run.id);
        return next;
      });
    }
  };

  return { isRevalidating: (runId: string) => revalidatingIds.has(runId), revalidate };
}
