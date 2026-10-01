import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import { getInitialSelectedItemId, mapChecklistToRun } from './runExecutionMappers';
import type { RunExecutionLoadResult, RunExecutionMode } from './runExecutionResult';
import { getApiClient, type RunExecutionDependencies } from './runPersistence';

export type RunExecutionLoadOptions = {
  getCachedRun?: ((id: string) => ChecklistRun | undefined) | undefined;
  runId?: string | undefined;
  shareToken?: string | undefined;
};

export const resolveMode = ({
  shareToken,
}: {
  shareToken?: string | undefined;
}): RunExecutionMode => (shareToken ? 'shared' : 'private');

export const loadRunExecutionData = async (
  options: RunExecutionLoadOptions,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionLoadResult> => {
  const mode = resolveMode(options);
  const apiClient = getApiClient(dependencies);

  if (mode === 'private') {
    if (!options.runId) {
      return { kind: 'not_found', mode };
    }

    const cachedRun = options.getCachedRun?.(options.runId);
    if (cachedRun) {
      return {
        kind: 'ok',
        mode,
        run: cachedRun,
        selectedItemId: getInitialSelectedItemId(cachedRun),
      };
    }

    try {
      const checklist = await apiClient.getChecklistById(options.runId);
      const run = mapChecklistToRun(checklist, options.runId);
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
  }

  if (!options.shareToken) {
    return { kind: 'not_found', mode };
  }

  try {
    const checklist = await apiClient.getSharedChecklist(options.shareToken);
    const run = mapChecklistToRun(checklist, options.shareToken);

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
