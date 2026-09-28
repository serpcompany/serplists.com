import type { QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { buildSharePath } from '@/lib/routes';

type RunShareApiClient = Pick<typeof api, 'createChecklistRunShare'>;
type RunSharingApiClient = Pick<typeof api, 'createChecklistRunShare' | 'revokeChecklistRunShare'>;

export async function createRunsDashboardShareUrl(
  runId: string,
  origin: string,
  apiClient: RunShareApiClient = api,
): Promise<string> {
  const result = await apiClient.createChecklistRunShare(runId);
  return new URL(buildSharePath(result.shareToken), origin).toString();
}

// Sharing changes the run's isPublic flag, which the runs list shows (and which decides
// whether Revalidate is offered), so both actions refresh the list once they succeed.
export function createRunSharingActions(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  apiClient: RunSharingApiClient = api,
) {
  const refreshRuns = () => queryClient.invalidateQueries({ queryKey: ['runs'] });

  return {
    shareRun: async (runId: string, origin: string): Promise<string> => {
      const shareUrl = await createRunsDashboardShareUrl(runId, origin, apiClient);
      void refreshRuns();
      return shareUrl;
    },
    stopSharingRun: async (runId: string): Promise<void> => {
      await apiClient.revokeChecklistRunShare(runId);
      await refreshRuns();
    },
  };
}
