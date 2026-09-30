import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ChecklistRunHistoryResponse } from '@/lib/api';
import { markRunShared, refreshRunHistory } from '@/lib/queryCache';
import type { ChecklistRun } from '@/types/checklist';

import {
  countRunExecutionItems,
  getInitialSelectedItemId,
  getSelectedRunItem,
  getSelectionAfterToggle,
} from './runExecutionMappers';
import { pruneNoteDrafts, updateNoteDraft, type NoteDrafts } from './noteDrafts';
import type { RunExecutionActionResult } from './runExecutionResult';
import { buildRunHistoryQuery } from './runHistory';
import { createRunSaver, type QueuedRunSave } from './runSaver';
import type { RunExecutionDependencies, UpdateRun } from './runPersistence';
import { bindRunSaves } from './runExecutionActions';
import { loadRunExecutionData, resolveMode, type RunExecutionLoadOptions } from './runExecutionLoad';

export type { RunExecutionActionResult, RunExecutionLoadResult, RunExecutionMode } from './runExecutionResult';

export type RunExecutionHistoryState = {
  data: ChecklistRunHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
};

export type UseRunExecutionModelOptions = RunExecutionLoadOptions & {
  updateRun: UpdateRun;
  dependencies?: Omit<RunExecutionDependencies, 'updateRun'>;
};

export const useRunExecutionModel = (
  options: UseRunExecutionModelOptions,
) => {
  const mode = resolveMode(options);
  const queryClient = useQueryClient();
  // Read when used: the page's updateRun (the Templates context's) and getCachedRun may
  // change identity whenever the cached lists do, and that must never reload the open run.
  const latestOptions = useRef(options);
  const dependencies = useMemo<RunExecutionDependencies>(
    () => ({
      apiClient: options.dependencies?.apiClient,
      onShared: (runId) => void markRunShared(queryClient, runId),
      origin: options.dependencies?.origin,
      refreshRuns: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
      updateRun: (run, updateOptions) => latestOptions.current.updateRun(run, updateOptions),
    }),
    [options.dependencies?.apiClient, options.dependencies?.origin, queryClient],
  );
  const latestDependencies = useRef(dependencies);
  // Before the effects below (the load reads both).
  useLayoutEffect(() => {
    latestOptions.current = options;
    latestDependencies.current = dependencies;
  });
  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // The latest run, updated as soon as a save returns so the next queued save builds on it.
  const latestRun = useRef<ChecklistRun | null>(null);
  // Every save writes an audit event: refresh the Changelog once the saves settle.
  const [saveRun] = useState(() =>
    createRunSaver((latest) => {
      if (latest) void refreshRunHistory(queryClient, latest.id);
    }),
  );
  // Drafts are read inside queued saves, so the ref always holds the latest value.
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
  const latestNoteDrafts = useRef<NoteDrafts>({});
  const commitNoteDrafts = (next: NoteDrafts) => {
    latestNoteDrafts.current = next;
    setNoteDrafts(next);
  };

  // Loads only when the page opens another run: a load clears the unsaved notes and the
  // selection, so nothing else (a new callback or client) may start one.
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
          getCachedRun: latestOptions.current.getCachedRun,
          runId: options.runId,
          shareToken: options.shareToken,
        },
        latestDependencies.current,
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
  }, [options.runId, options.shareToken]);

  const counts = countRunExecutionItems(run);
  const selectedData = getSelectedRunItem(run, selectedItemId);
  const historyQuery = buildRunHistoryQuery({ runId: run?.id, mode, client: api });
  const canLoadHistory = historyQuery.enabled;
  const history = useQuery(historyQuery);

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
  // Bound when the user acts: queued saves read the drafts as they are when their turn comes.
  const saves = () => bindRunSaves({ dependencies, noteDrafts: () => latestNoteDrafts.current, shareToken });

  return {
    counts,
    hasUnsavedNotes: Object.keys(noteDrafts).length > 0,
    noteDrafts,
    setNoteDraft: (itemId: string, value: string) =>
      commitNoteDrafts(
        updateNoteDraft(latestNoteDrafts.current, itemId, value, getSelectedRunItem(latestRun.current, itemId)?.item.notes),
      ),
    // Notes kept when the session ended (keptNoteDrafts.ts), back as unsaved drafts.
    restoreNoteDrafts: (drafts: NoteDrafts) => commitNoteDrafts({ ...latestNoteDrafts.current, ...drafts }),
    createShare: () => enqueueSave(saves().share),
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
    saveTitle: (title: string) => enqueueSave(saves().title(title)),
    saveItemNotes: (itemId: string, notes: string) => enqueueSave(saves().notes(itemId, notes)),
    selectedData,
    selectedItemId,
    setSelectedItemId,
    // Stop sharing: the share link stops working and the run becomes private.
    stopSharing: () => enqueueSave(saves().stopSharing),
    completeRun: () => enqueueSave(saves().complete),
    // isCompleted is the value the user clicked on the run they saw.
    toggleItem: async (itemId: string, isCompleted: boolean) => {
      const result = await enqueueSave(saves().toggleItem(itemId, isCompleted));
      // Completing the selected task moves on to the next unfinished one, judged on the
      // selection when the save lands (an updater), not the one captured at the click.
      const saved = result.kind === 'ok' ? result.run : undefined;
      if (saved) setSelectedItemId((current) => getSelectionAfterToggle(saved, itemId, current));
      return result;
    },
    toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) =>
      enqueueSave(saves().toggleSubItem(itemId, contentIndex, subItemIndex, isCompleted)),
  };
};
