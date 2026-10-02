import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import type { ApiRun } from '@/lib/schemas/apiRuns';

import { getInitialSelectedItemId, mapChecklistToRun } from './runExecutionMappers';
import type { RunExecutionLoadResult, RunExecutionMode } from './runExecutionResult';
import { getApiClient, type RunExecutionDependencies } from './runPersistence';

export type RunExecutionLoadOptions = {
  runId?: string | undefined;
  shareToken?: string | undefined;
};

export const resolveMode = ({
  shareToken,
}: {
  shareToken?: string | undefined;
}): RunExecutionMode => (shareToken ? 'shared' : 'private');

const loadRun = async (
  mode: RunExecutionMode,
  key: string | undefined,
  fetchRun: (key: string) => Promise<ApiRun>,
): Promise<RunExecutionLoadResult> => {
  if (!key) {
    return { kind: 'not_found', mode };
  }

  try {
    const run = mapChecklistToRun(await fetchRun(key), key);
    return {
      kind: 'ok',
      mode,
      run,
      selectedItemId: getInitialSelectedItemId(run),
    };
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return { kind: 'not_found', mode };
    }

    return {
      kind: 'error',
      message: getApiErrorMessage(error, 'Unable to load run.'),
      mode,
    };
  }
};

export const loadRunExecutionData = async (
  options: RunExecutionLoadOptions,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionLoadResult> => {
  const mode = resolveMode(options);
  const apiClient = getApiClient(dependencies);

  return mode === 'private'
    ? loadRun(mode, options.runId, (runId) => apiClient.getChecklistById(runId))
    : loadRun(mode, options.shareToken, (shareToken) => apiClient.getSharedChecklist(shareToken));
};
