import { useEffect, useMemo, useState } from 'react';

import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import { api } from '@/lib/api';
import { buildSharePath } from '@/lib/routes';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import {
  areAllRunItemsCompleted,
  cloneRunSections,
  countRunExecutionItems,
  getInitialSelectedItemId,
  getSelectedRunItem,
  mapChecklistToRun,
  setSubItemsCompletion,
} from './runExecutionMappers';

type RunExecutionApiClient = Pick<
  typeof api,
  | 'createChecklistRunShare'
  | 'getChecklistById'
  | 'getSharedChecklist'
  | 'updateSharedChecklist'
>;

type UpdateRun = (run: ChecklistRun) => void | Promise<ChecklistRun | void>;

type RunExecutionDependencies = {
  apiClient?: RunExecutionApiClient;
  origin?: string;
  updateRun: UpdateRun;
};

type RunExecutionLoadOptions = {
  getCachedRun?: (id: string) => ChecklistRun | undefined;
  runId?: string;
  shareToken?: string;
};

type RunExecutionMutationParams = {
  run?: ChecklistRun;
  shareToken?: string;
};

type ToggleRunItemParams = RunExecutionMutationParams & {
  itemId: string;
};

type ToggleRunSubItemParams = RunExecutionMutationParams & {
  contentIndex: number;
  itemId: string;
  subItemIndex: number;
};

type SaveRunTitleParams = RunExecutionMutationParams & {
  title: string;
};

type CompleteRunExecutionParams = RunExecutionMutationParams & {
  completedAt?: string;
};

export type RunExecutionMode = 'private' | 'shared';

export type RunExecutionLoadResult =
  | {
      kind: 'ok';
      mode: RunExecutionMode;
      run: ChecklistRun;
      selectedItemId: string | null;
    }
  | {
      kind: 'error';
      message: string;
      mode: RunExecutionMode;
    }
  | {
      kind: 'not_found';
      mode: RunExecutionMode;
    };

export type RunExecutionActionResult =
  | {
      kind: 'ok';
      run?: ChecklistRun;
      shareUrl?: string;
      shouldPromptComplete?: boolean;
    }
  | {
      kind: 'shared_disabled';
    }
  | {
      kind: 'not_found';
    }
  | {
      kind: 'error';
      message: string;
    };

export type UseRunExecutionModelOptions = RunExecutionLoadOptions & {
  updateRun: UpdateRun;
  dependencies?: Omit<RunExecutionDependencies, 'updateRun'>;
};

const getApiClient = (
  dependencies: RunExecutionDependencies,
): RunExecutionApiClient => dependencies.apiClient ?? api;

const resolveMode = ({
  shareToken,
}: {
  shareToken?: string;
}): RunExecutionMode => (shareToken ? 'shared' : 'private');

const toErrorResult = (
  error: unknown,
  fallbackMessage: string,
): RunExecutionActionResult => ({
  kind: 'error',
  message: error instanceof Error ? error.message : fallbackMessage,
});

const persistRun = async (
  params: RunExecutionMutationParams,
  dependencies: RunExecutionDependencies,
): Promise<ChecklistRun> => {
  if (!params.run) {
    throw new Error('Run not found.');
  }

  const apiClient = getApiClient(dependencies);
  const progress = calculateSectionsProgress(params.run.sections);
  const nextRun = { ...params.run, progress };

  if (params.shareToken) {
    await apiClient.updateSharedChecklist(params.shareToken, {
      completed_at: nextRun.completedAt,
      progress,
      sections: nextRun.sections,
      status: nextRun.status,
    });
    return nextRun;
  }

  await dependencies.updateRun(nextRun);
  return nextRun;
};

const withClonedRun = (run: ChecklistRun): ChecklistRun => ({
  ...run,
  sections: cloneRunSections(run.sections),
});

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
      const checklist = (await apiClient.getChecklistById(
        options.runId,
      )) as Record<string, unknown>;
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
    const checklist = (await apiClient.getSharedChecklist(
      options.shareToken,
    )) as Record<string, unknown>;
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

export const toggleRunItem = async (
  params: ToggleRunItemParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const nextRun = withClonedRun(params.run);

  for (const section of nextRun.sections) {
    for (const item of section.items) {
      if (item.id !== params.itemId) {
        continue;
      }

      const isCompleted = !item.isCompleted;
      item.isCompleted = isCompleted;
      item.contents = item.contents?.map((content) => {
        if (content.type !== 'subItems') {
          return content;
        }

        return {
          ...content,
          subItems: setSubItemsCompletion(content.subItems, isCompleted),
        };
      });

      try {
        const persistedRun = await persistRun(
          { run: nextRun, shareToken: params.shareToken },
          dependencies,
        );

        return {
          kind: 'ok',
          run: persistedRun,
          shouldPromptComplete:
            persistedRun.status !== 'completed' &&
            areAllRunItemsCompleted(persistedRun),
        };
      } catch (error) {
        return toErrorResult(error, 'Unable to save your progress.');
      }
    }
  }

  return { kind: 'not_found' };
};

export const toggleRunSubItem = async (
  params: ToggleRunSubItemParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const nextRun = withClonedRun(params.run);

  for (const section of nextRun.sections) {
    for (const item of section.items) {
      if (item.id !== params.itemId || !item.contents) {
        continue;
      }

      const content = item.contents[params.contentIndex];
      if (content?.type !== 'subItems' || !content.subItems) {
        return { kind: 'not_found' };
      }

      const subItem = content.subItems[params.subItemIndex];
      if (!subItem) {
        return { kind: 'not_found' };
      }

      subItem.isCompleted = !subItem.isCompleted;
      item.isCompleted = content.subItems.every(
        (candidate) => candidate.isCompleted,
      );

      try {
        const persistedRun = await persistRun(
          { run: nextRun, shareToken: params.shareToken },
          dependencies,
        );

        return {
          kind: 'ok',
          run: persistedRun,
          shouldPromptComplete:
            persistedRun.status !== 'completed' &&
            areAllRunItemsCompleted(persistedRun),
        };
      } catch (error) {
        return toErrorResult(error, 'Unable to save your progress.');
      }
    }
  }

  return { kind: 'not_found' };
};

export const saveRunExecutionTitle = async (
  params: SaveRunTitleParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  if (params.shareToken) {
    return { kind: 'shared_disabled' };
  }

  const title = params.title.trim();
  if (!title) {
    return { kind: 'error', message: 'Run title cannot be empty.' };
  }

  try {
    const persistedRun = await persistRun(
      {
        run: {
          ...params.run,
          title,
        },
      },
      dependencies,
    );

    return { kind: 'ok', run: persistedRun };
  } catch (error) {
    return toErrorResult(error, 'Unable to update the run title.');
  }
};

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
    const origin =
      dependencies.origin ??
      (typeof window !== 'undefined' ? window.location.origin : '');

    return {
      kind: 'ok',
      shareUrl: `${origin}${buildSharePath(result.shareToken)}`,
    };
  } catch (error) {
    return toErrorResult(error, 'Failed to create share link for this run.');
  }
};

export const completeRunExecution = async (
  params: CompleteRunExecutionParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const completedRun: ChecklistRun = {
    ...params.run,
    completedAt: params.completedAt ?? new Date().toISOString(),
    progress: 100,
    status: 'completed',
  };

  try {
    const persistedRun = await persistRun(
      { run: completedRun, shareToken: params.shareToken },
      dependencies,
    );

    return { kind: 'ok', run: persistedRun };
  } catch (error) {
    return toErrorResult(error, 'Unable to save completion.');
  }
};

export const useRunExecutionModel = (
  options: UseRunExecutionModelOptions,
) => {
  const mode = resolveMode(options);
  const dependencies = useMemo<RunExecutionDependencies>(
    () => ({
      apiClient: options.dependencies?.apiClient,
      origin: options.dependencies?.origin,
      updateRun: options.updateRun,
    }),
    [options.dependencies?.apiClient, options.dependencies?.origin, options.updateRun],
  );
  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);

      const result = await loadRunExecutionData(
        {
          getCachedRun: options.getCachedRun,
          runId: options.runId,
          shareToken: options.shareToken,
        },
        dependencies,
      );

      if (cancelled) {
        return;
      }

      if (result.kind === 'ok') {
        setRun(result.run);
        setSelectedItemId(result.selectedItemId);
        setLoadError(null);
        setNotFound(false);
      } else if (result.kind === 'error') {
        setRun(null);
        setSelectedItemId(null);
        setLoadError(result.message);
        setNotFound(false);
      } else {
        setRun(null);
        setSelectedItemId(null);
        setLoadError(null);
        setNotFound(true);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [dependencies, options.getCachedRun, options.runId, options.shareToken]);

  const counts = countRunExecutionItems(run);
  const selectedData = getSelectedRunItem(run, selectedItemId);

  const applyResult = (result: RunExecutionActionResult): RunExecutionActionResult => {
    if (result.kind === 'ok' && result.run) {
      setRun(result.run);
      setSelectedItemId((currentSelectedItemId) => {
        if (!currentSelectedItemId) {
          return getInitialSelectedItemId(result.run ?? null);
        }

        return (
          getSelectedRunItem(result.run ?? null, currentSelectedItemId)?.item.id ??
          getInitialSelectedItemId(result.run ?? null)
        );
      });
    }

    return result;
  };

  return {
    counts,
    createShare: async () =>
      applyResult(
        await createRunExecutionShare(
          { run, shareToken: options.shareToken },
          dependencies,
        ),
      ),
    isSharedRun: mode === 'shared',
    loadError,
    loading,
    mode,
    notFound,
    progress: counts.progress,
    run,
    saveTitle: async (title: string) => {
      if (!run) {
        return { kind: 'not_found' } as RunExecutionActionResult;
      }

      return applyResult(
        await saveRunExecutionTitle(
          { run, shareToken: options.shareToken, title },
          dependencies,
        ),
      );
    },
    selectedData,
    selectedItemId,
    setSelectedItemId,
    completeRun: async () => {
      if (!run) {
        return { kind: 'not_found' } as RunExecutionActionResult;
      }

      return applyResult(
        await completeRunExecution(
          { run, shareToken: options.shareToken },
          dependencies,
        ),
      );
    },
    toggleItem: async (itemId: string) => {
      if (!run) {
        return { kind: 'not_found' } as RunExecutionActionResult;
      }

      return applyResult(
        await toggleRunItem(
          { itemId, run, shareToken: options.shareToken },
          dependencies,
        ),
      );
    },
    toggleSubItem: async (
      itemId: string,
      contentIndex: number,
      subItemIndex: number,
    ) => {
      if (!run) {
        return { kind: 'not_found' } as RunExecutionActionResult;
      }

      return applyResult(
        await toggleRunSubItem(
          {
            contentIndex,
            itemId,
            run,
            shareToken: options.shareToken,
            subItemIndex,
          },
          dependencies,
        ),
      );
    },
  };
};
