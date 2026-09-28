import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getApiErrorMessage, isApiError } from '@/lib/api-errors';
import { api, type ChecklistRunHistoryResponse } from '@/lib/api';
import { buildSharePath } from '@/lib/routes';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import {
  areAllRunItemsCompleted,
  areItemSubItemsCompleted,
  cloneRunSections,
  countRunExecutionItems,
  findRunSubItem,
  getInitialSelectedItemId,
  getNextSelectedItemId,
  getSelectedRunItem,
  itemHasCompletion,
  mapChecklistToRun,
  setSubItemsCompletion,
} from './runExecutionMappers';
import { applyNoteDrafts, draftedNotesChanged, pruneNoteDrafts, updateNoteDraft, type NoteDrafts } from './noteDrafts';
import {
  toErrorResult,
  type RunExecutionActionResult,
  type RunExecutionLoadResult,
  type RunExecutionMode,
} from './runExecutionResult';
import { createRunSaver, type QueuedRunSave, type RunSave } from './runSaver';
import { isRunTitleChange } from './runTitle';

export type { RunExecutionActionResult, RunExecutionLoadResult, RunExecutionMode } from './runExecutionResult';

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
  run?: ChecklistRun | null;
  shareToken?: string;
};

// isCompleted is the value the user clicked, set rather than flipped: a save queued behind
// another, or retried on a reloaded run, never inverts it or undoes the same change made
// elsewhere.
type ToggleRunItemParams = RunExecutionMutationParams & {
  isCompleted: boolean;
  itemId: string;
  // Unsaved notes; the toggled task's draft is saved with the toggle (one PUT).
  noteDrafts?: NoteDrafts;
};

type ToggleRunSubItemParams = RunExecutionMutationParams & {
  contentIndex: number;
  isCompleted: boolean;
  itemId: string;
  // Finds the sub-task by id when a reloaded run moved it to another row.
  subItemId?: string;
  subItemIndex: number;
};

type SaveRunItemNotesParams = RunExecutionMutationParams & {
  itemId: string;
  notes: string;
};

type SaveRunTitleParams = RunExecutionMutationParams & {
  title: string;
};

type CompleteRunExecutionParams = RunExecutionMutationParams & {
  completedAt?: string;
  // Unsaved notes for any task, saved with the completion before the page leaves.
  noteDrafts?: NoteDrafts;
};

export type RunExecutionHistoryState = {
  data: ChecklistRunHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
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
    const result = await apiClient.updateSharedChecklist(params.shareToken, {
      completed_at: nextRun.completedAt,
      expected_revision: nextRun.revision,
      progress,
      sections: nextRun.sections,
      status: nextRun.status,
    });
    return {
      ...nextRun,
      revision:
        typeof (result as { revision?: unknown })?.revision === 'number'
          ? (result as { revision: number }).revision
          : nextRun.revision,
    };
  }

  const persisted = await dependencies.updateRun(nextRun);
  return persisted ?? nextRun;
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

// Saves a toggled run. A run the toggle left unchanged (it already had the chosen value)
// is not sent.
const saveToggledRun = async (
  run: ChecklistRun,
  changed: boolean,
  shareToken: string | undefined,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  try {
    const saved = changed ? await persistRun({ run, shareToken }, dependencies) : run;
    return {
      kind: 'ok',
      run: saved,
      shouldPromptComplete: saved.status !== 'completed' && areAllRunItemsCompleted(saved),
    };
  } catch (error) {
    return toErrorResult(error, 'Unable to save your progress.');
  }
};

export const toggleRunItem = async (
  params: ToggleRunItemParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const nextRun = withClonedRun(
    applyNoteDrafts(params.run, params.noteDrafts ?? {}, [params.itemId]),
  );

  for (const section of nextRun.sections) {
    for (const item of section.items) {
      if (item.id !== params.itemId) {
        continue;
      }

      const { isCompleted } = params;
      if (itemHasCompletion(item, isCompleted)) {
        return saveToggledRun(params.run, false, params.shareToken, dependencies);
      }
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

      return saveToggledRun(nextRun, true, params.shareToken, dependencies);
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

      const subItem = findRunSubItem(item, params);
      if (!subItem) {
        return { kind: 'not_found' };
      }

      if ((subItem.isCompleted === true) === params.isCompleted) {
        return saveToggledRun(params.run, false, params.shareToken, dependencies);
      }
      subItem.isCompleted = params.isCompleted;
      // Every Sub-tasks block counts, not only the one that was clicked.
      item.isCompleted = areItemSubItemsCompleted(item);

      return saveToggledRun(nextRun, true, params.shareToken, dependencies);
    }
  }

  return { kind: 'not_found' };
};

export const saveRunItemNotes = async (
  params: SaveRunItemNotesParams,
  dependencies: RunExecutionDependencies,
): Promise<RunExecutionActionResult> => {
  if (!params.run) {
    return { kind: 'not_found' };
  }

  const nextRun = withClonedRun(params.run);
  for (const section of nextRun.sections) {
    const item = section.items.find((candidate) => candidate.id === params.itemId);
    if (!item) continue;

    item.notes = params.notes;
    try {
      return {
        kind: 'ok',
        run: await persistRun(
          { run: nextRun, shareToken: params.shareToken },
          dependencies,
        ),
      };
    } catch (error) {
      return toErrorResult(error, 'Unable to save task notes.');
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
  // Compared with the latest run in the queue: an unchanged title sends nothing.
  if (!isRunTitleChange(title, params.run.title)) {
    return { kind: 'ok', run: params.run };
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

  // Checked on the latest run inside the queued save, so an untick queued before this
  // save wins. Re-sending completion would overwrite completed_at and add an audit event.
  if (params.run.status === 'completed') {
    return { kind: 'ok', run: params.run };
  }
  if (!areAllRunItemsCompleted(params.run)) {
    return { kind: 'error', message: 'Finish every task before completing the run.' };
  }

  const completedRun: ChecklistRun = {
    ...applyNoteDrafts(params.run, params.noteDrafts ?? {}),
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

// The page's saves, each bound to the run it runs on (see runSaver.ts). A toggle sets the
// value the user clicked; notes, a title, and completion are not retried over notes or a
// title someone else changed.
export const bindRunSaves = ({ dependencies, noteDrafts, shareToken }: {
  dependencies: RunExecutionDependencies;
  noteDrafts: () => NoteDrafts;
  shareToken?: string;
}) => ({
  complete: {
    bind: (current: ChecklistRun): RunSave => ({
      canRetryOn: (fresh) => !draftedNotesChanged(noteDrafts(), current, fresh),
      save: (run) => completeRunExecution({ noteDrafts: noteDrafts(), run, shareToken }, dependencies),
    }),
    key: 'complete',
  } satisfies QueuedRunSave,
  notes: (itemId: string, notes: string): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => !draftedNotesChanged({ [itemId]: notes }, current, fresh),
      save: (run) => saveRunItemNotes({ itemId, notes, run, shareToken }, dependencies),
    }),
    key: `notes:${itemId}:${notes}`,
  }),
  share: {
    bind: (): RunSave => ({ save: (run) => createRunExecutionShare({ run, shareToken }, dependencies) }),
    key: 'share',
  } satisfies QueuedRunSave,
  title: (title: string): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => fresh.title === current.title,
      save: (run) => saveRunExecutionTitle({ run, shareToken, title }, dependencies),
    }),
    key: `title:${title}`,
  }),
  toggleItem: (itemId: string, isCompleted: boolean): QueuedRunSave => ({
    bind: (current) => ({
      canRetryOn: (fresh) => !draftedNotesChanged(noteDrafts(), current, fresh, [itemId]),
      save: (run) => toggleRunItem({ isCompleted, itemId, noteDrafts: noteDrafts(), run, shareToken }, dependencies),
    }),
    key: `toggle:${itemId}:${isCompleted}`,
  }),
  toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean): QueuedRunSave => ({
    bind: (current) => {
      const item = getSelectedRunItem(current, itemId)?.item;
      const subItemId = item && findRunSubItem(item, { contentIndex, subItemIndex })?.id;
      const target = { contentIndex, isCompleted, itemId, subItemId, subItemIndex };
      return { save: (run) => toggleRunSubItem({ ...target, run, shareToken }, dependencies) };
    },
    key: `toggle:${itemId}:${contentIndex}:${subItemIndex}:${isCompleted}`,
  }),
});

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
  // The latest run, updated as soon as a save returns so the next queued save builds on it.
  const latestRun = useRef<ChecklistRun | null>(null);
  const [saveRun] = useState(createRunSaver);
  // Drafts are read inside queued saves, so the ref always holds the latest value.
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
  const latestNoteDrafts = useRef<NoteDrafts>({});
  const commitNoteDrafts = (next: NoteDrafts) => {
    latestNoteDrafts.current = next;
    setNoteDrafts(next);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
      latestNoteDrafts.current = {};
      setNoteDrafts({});

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
        latestRun.current = result.run;
        setRun(result.run);
        setSelectedItemId(result.selectedItemId);
        setLoadError(null);
        setNotFound(false);
      } else if (result.kind === 'error') {
        latestRun.current = null;
        setRun(null);
        setSelectedItemId(null);
        setLoadError(result.message);
        setNotFound(false);
      } else {
        latestRun.current = null;
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
  const canLoadHistory = Boolean(run?.id && mode !== 'shared');
  const history = useQuery({
    queryKey: ['checklist-run-history', run?.id ?? 'none'],
    queryFn: () => api.getChecklistHistory(run?.id ?? ''),
    enabled: canLoadHistory,
    retry: false,
  });

  const applyResult = (result: RunExecutionActionResult): RunExecutionActionResult => {
    if (result.kind === 'ok' && result.run) {
      latestRun.current = result.run;
      setRun(result.run);
      commitNoteDrafts(pruneNoteDrafts(latestNoteDrafts.current, result.run));
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

  const shareToken = options.shareToken;
  // Saves run one at a time on the latest run, and recover from an edit conflict by
  // reloading the run (never from a cache) and retrying once (see runSaver.ts).
  const enqueueSave = (save: QueuedRunSave) =>
    saveRun(save, {
      apply: applyResult,
      latest: () => latestRun.current,
      onNotFound: () => setNotFound(true),
      reload: () => loadRunExecutionData({ runId: options.runId, shareToken }, dependencies),
    });
  const saves = bindRunSaves({ dependencies, noteDrafts: () => latestNoteDrafts.current, shareToken });

  return {
    counts,
    hasUnsavedNotes: Object.keys(noteDrafts).length > 0,
    noteDrafts,
    setNoteDraft: (itemId: string, value: string) =>
      commitNoteDrafts(
        updateNoteDraft(latestNoteDrafts.current, itemId, value, getSelectedRunItem(latestRun.current, itemId)?.item.notes),
      ),
    createShare: () => enqueueSave(saves.share),
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadHistory && history.isLoading,
    } satisfies RunExecutionHistoryState,
    isSharedRun: mode === 'shared',
    loadError,
    loading,
    mode,
    notFound,
    progress: counts.progress,
    run,
    saveTitle: (title: string) => enqueueSave(saves.title(title)),
    saveItemNotes: (itemId: string, notes: string) => enqueueSave(saves.notes(itemId, notes)),
    selectedData,
    selectedItemId,
    setSelectedItemId,
    completeRun: () => enqueueSave(saves.complete),
    // isCompleted is the value the user clicked on the run they saw.
    toggleItem: async (itemId: string, isCompleted: boolean) => {
      const result = await enqueueSave(saves.toggleItem(itemId, isCompleted));
      // Completing the selected task moves on to the next unfinished one.
      if (
        result.kind === 'ok' &&
        result.run &&
        itemId === selectedItemId &&
        getSelectedRunItem(result.run, itemId)?.item.isCompleted
      ) {
        setSelectedItemId(getNextSelectedItemId(result.run, itemId));
      }
      return result;
    },
    toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) =>
      enqueueSave(saves.toggleSubItem(itemId, contentIndex, subItemIndex, isCompleted)),
  };
};
