import type { QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { buildSharePath } from '@/lib/routes';

type RunShareApiClient = Pick<typeof api, 'createChecklistRunShare'>;

// `onShared` runs as soon as the API has made the run public, before any copy that might
// fail, so the cached runs list stops offering Revalidate (refused for shared runs).
export async function createRunsDashboardShareUrl(
  runId: string,
  origin: string,
  apiClient: RunShareApiClient = api,
  onShared?: (runId: string) => void,
): Promise<string> {
  const result = await apiClient.createChecklistRunShare(runId);
  onShared?.(runId);
  return new URL(buildSharePath(result.shareToken), origin).toString();
}

// Stopping a share makes the run private, which the runs list shows (and which decides
// whether Revalidate is offered), so the list refreshes once the API confirms it. Sharing
// refreshes it through onShared (markRunShared in src/lib/queryCache.ts).
export function createRunSharingActions(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  apiClient: Pick<typeof api, 'revokeChecklistRunShare'> = api,
) {
  return {
    stopSharingRun: async (runId: string): Promise<void> => {
      await apiClient.revokeChecklistRunShare(runId);
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  };
}
