import { api } from '@/lib/api';
import { buildSharePath } from '@/lib/routes';

type RunShareApiClient = Pick<typeof api, 'createChecklistRunShare'>;

export async function createRunsDashboardShareUrl(
  runId: string,
  origin: string,
  apiClient: RunShareApiClient = api,
): Promise<string> {
  const result = await apiClient.createChecklistRunShare(runId);
  return new URL(buildSharePath(result.shareToken), origin).toString();
}
