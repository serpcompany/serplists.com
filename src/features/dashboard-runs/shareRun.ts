import type { QueryClient } from '@tanstack/react-query';

import { refreshRunsAfterConflict } from '@/contexts/templateListCache';
import { api } from '@/lib/api';
import { refreshRunHistory } from '@/lib/queryCache';
import { buildSharePath } from '@/lib/routes';

type RunShareApiClient = Pick<typeof api, 'createChecklistRunShare'>;

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
