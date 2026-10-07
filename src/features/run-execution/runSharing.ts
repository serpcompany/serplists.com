import { buildSharePath } from '@/lib/routes';

import { runOpenedByItsOwner, toErrorResult, type RunExecutionActionResult } from './runExecutionResult';
import { getApiClient, type RunExecutionDependencies, type RunExecutionMutationParams } from './runPersistence';

export const createRunExecutionShare = async (
  params: RunExecutionMutationParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  const target = runOpenedByItsOwner(params);
  if ('refusal' in target) return target.refusal;
  const { run } = target;

  const apiClient = getApiClient(dependencies);

  try {
    const result = await apiClient.createChecklistRunShare(run.id);
    dependencies.onShared?.(run.id);
    const origin =
      dependencies.origin ??
      (typeof window !== 'undefined' ? window.location.origin : '');

    return {
      kind: 'ok',
      run: { ...run, isPublic: true },
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
  const target = runOpenedByItsOwner(params);
  if ('refusal' in target) return target.refusal;
  const { run } = target;

  try {
    await getApiClient(dependencies).revokeChecklistRunShare(run.id);
    void dependencies.refreshRuns?.();
    return { kind: 'ok', run: { ...run, isPublic: false } };
  } catch (error) {
    return toErrorResult(error, 'Unable to stop sharing this run.');
  }
};
