import { buildSharePath } from '@/lib/routes';

import { toErrorResult, type RunExecutionActionResult } from './runExecutionResult';
import { getApiClient, type RunExecutionDependencies, type RunExecutionMutationParams } from './runPersistence';

// Sharing a run from the run page, and stopping it. Neither changes the run's revision on
// the server, so the page keeps saving on the run it has.

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
      // Public now; the server does not change the revision.
      run: { ...params.run, isPublic: true },
      shareUrl: `${origin}${buildSharePath(result.shareToken)}`,
    };
  } catch (error) {
    return toErrorResult(error, 'Failed to create share link for this run.');
  }
};

/** Stop sharing: the share link stops working and the run becomes private. */
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
    // No revision bump on the server either, so later saves keep working.
    return { kind: 'ok', run: { ...params.run, isPublic: false } };
  } catch (error) {
    return toErrorResult(error, 'Unable to stop sharing this run.');
  }
};
