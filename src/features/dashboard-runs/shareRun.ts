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
