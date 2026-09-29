import type { QueryClient } from '@tanstack/react-query';

import { refreshRunsAfterConflict } from '@/contexts/templateListCache';
import { api } from '@/lib/api';
import { refreshRunHistory } from '@/lib/queryCache';
import { buildSharePath } from '@/lib/routes';

type RunShareApiClient = Pick<typeof api, 'createChecklistRunShare'>;

// `onShared` runs as soon as the API has made the run public, before any copy that might
// fail, so the cached runs list stops offering Revalidate (refused for shared runs).
// `onFailed` runs, and finishes, before a refused share rejects (refreshAfterShareFailure).
export async function createRunsDashboardShareUrl(
  runId: string,
  origin: string,
  apiClient: RunShareApiClient = api,
  onShared?: (runId: string) => void,
  onFailed?: (error: unknown) => Promise<void>,
): Promise<string> {
  let result: Awaited<ReturnType<RunShareApiClient['createChecklistRunShare']>>;
  try {
    result = await apiClient.createChecklistRunShare(runId);
  } catch (error) {
    await onFailed?.(error);
    throw error;
  }
  onShared?.(runId);
  return new URL(buildSharePath(result.shareToken), origin).toString();
}

// Stopping a share makes the run private, which the runs list shows (and which decides
// whether Revalidate is offered), so the list refreshes once the API confirms it, and so does
// the run's Changelog, which the API wrote "Stopped sharing" to. Sharing refreshes both
// through onShared (refreshAfterRunShared in src/contexts/templateListCache.ts).
// A run archived elsewhere stays in the cached list, so a Share or Stop sharing refused for a
// stale record reloads the list before the error shows, and the run leaves it.
export function createRunSharingActions(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  apiClient: Pick<typeof api, 'revokeChecklistRunShare'> = api,
) {
  const refreshAfterShareFailure = (error: unknown) => refreshRunsAfterConflict(queryClient, error);
  return {
    stopSharingRun: async (runId: string): Promise<void> => {
      try {
        await apiClient.revokeChecklistRunShare(runId);
      } catch (error) {
        await refreshAfterShareFailure(error);
        throw error;
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['runs'] }), refreshRunHistory(queryClient, runId)]);
    },
    refreshAfterShareFailure,
  };
}
