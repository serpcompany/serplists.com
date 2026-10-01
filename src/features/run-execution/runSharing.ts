import { buildSharePath } from '@/lib/routes';

import { toErrorResult, type RunExecutionActionResult } from './runExecutionResult';
import { getApiClient, type RunExecutionDependencies, type RunExecutionMutationParams } from './runPersistence';

export const createRunExecutionShare = async (
  params: RunExecutionMutationParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  if (params.shareToken) {
    return { kind: 'shared_disabled' };
  }

  const apiClient = getApiClient(dependencies);

  try {
    const result = await apiClient.createChecklistRunShare(params.run.id);
    dependencies.onShared?.(params.run.id);
    const origin =
      dependencies.origin ??
      (typeof window !== 'undefined' ? window.location.origin : '');

    return {
      kind: 'ok',
      run: { ...params.run, isPublic: true },
      shareUrl: `${origin}${buildSharePath(result.shareToken)}`,
    };
  } catch (error) {
    return toErrorResult(error, 'Failed to create share link for this run.');
  }
};

export const stopRunExecutionSharing = async (
  params: RunExecutionMutationParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  if (params.shareToken) {
    return { kind: 'shared_disabled' };
  }

  try {
    await getApiClient(dependencies).revokeChecklistRunShare(params.run.id);
    void dependencies.refreshRuns?.();
    return { kind: 'ok', run: { ...params.run, isPublic: false } };
  } catch (error) {
    return toErrorResult(error, 'Unable to stop sharing this run.');
  }
};
