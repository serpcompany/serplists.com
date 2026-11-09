import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ChecklistRunHistoryResponse } from '@/lib/api';
import { markRunShared, refreshRunHistory } from '@/lib/queryCache';
import type { ChecklistRun, FormAnswer } from '@/types/checklist';

import {
  countRunExecutionItems,
  getInitialSelectedItemId,
  getSelectedRunItem,
  getSelectionAfterToggle,
} from './runExecutionMappers';
import { pruneNoteDrafts, updateNoteDraft, type NoteDrafts } from './noteDrafts';
import type { RunExecutionActionResult, RunExecutionLoadResult } from './runExecutionResult';
import { buildRunHistoryQuery } from './runHistory';
import { createRunSaver, type QueuedRunSave } from './runSaver';
import type { RunExecutionDependencies, UpdateRun } from './runPersistence';
import { bindRunSaves } from './runExecutionActions';
import { loadRunExecutionData, resolveMode, type RunExecutionLoadOptions } from './runExecutionLoad';

export type { RunExecutionActionResult } from './runExecutionResult';

export type RunExecutionHistoryState = {
  data: ChecklistRunHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
  onViewAll: () => void;
  showingAll: boolean;
};

type GuestRunSource = {
  load: (opened: ChecklistRun | null) => Promise<RunExecutionLoadResult>;
  templateId: string;
};

export type UseRunExecutionModelOptions = RunExecutionLoadOptions & {
  updateRun: UpdateRun;
  dependencies?: Omit<RunExecutionDependencies, 'updateRun'>;
  guest?: GuestRunSource | undefined;
};

export const useRunExecutionModel = (
  options: UseRunExecutionModelOptions,
) => {
  const mode = options.guest ? 'guest' : resolveMode(options);
  const queryClient = useQueryClient();
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
  useLayoutEffect(() => {
    latestOptions.current = options;
    latestDependencies.current = dependencies;
  });
  const [run, setRun] = useState<ChecklistRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const latestRun = useRef<ChecklistRun | null>(null);
  const [saveRun] = useState(() =>
    createRunSaver((latest) => {
      if (latest) void refreshRunHistory(queryClient, latest.id);
    }),
  );
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
  const latestNoteDrafts = useRef<NoteDrafts>({});
  const commitNoteDrafts = (next: NoteDrafts) => {
    latestNoteDrafts.current = next;
    setNoteDrafts(next);
  };

  const guestTemplateId = options.guest?.templateId;
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
      latestNoteDrafts.current = {};
      setNoteDrafts({});

      const { guest } = latestOptions.current;
      const result = guest
        ? await guest.load(null)
        : await loadRunExecutionData(
            {
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
  }, [guestTemplateId, options.runId, options.shareToken]);

  const counts = countRunExecutionItems(run);
  const selectedData = getSelectedRunItem(run, selectedItemId);
  const [showingAllHistory, setShowingAllHistory] = useState(false);
  const historyQuery = buildRunHistoryQuery({ runId: run?.id, mode, client: api, showingAll: showingAllHistory });
  const canLoadHistory = historyQuery.enabled;
  const history = useQuery({ ...historyQuery, placeholderData: keepPreviousData });

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

  const { guest, shareToken } = options;
  const enqueueSave = (save: QueuedRunSave) =>
    saveRun(save, {
      apply: applyResult,
      latest: () => latestRun.current,
      onNotFound: () => setNotFound(true),
      reload: () =>
        guest ? guest.load(latestRun.current) : loadRunExecutionData({ runId: options.runId, shareToken }, dependencies),
    });
  const saves = () => bindRunSaves({ dependencies, noteDrafts: () => latestNoteDrafts.current, shareToken });

  return {
    counts,
    hasUnsavedNotes: Object.keys(noteDrafts).length > 0,
    noteDrafts,
    setNoteDraft: (itemId: string, value: string) =>
      commitNoteDrafts(
        updateNoteDraft(latestNoteDrafts.current, itemId, value, getSelectedRunItem(latestRun.current, itemId)?.item.notes),
      ),
    restoreNoteDrafts: (drafts: NoteDrafts) => commitNoteDrafts({ ...latestNoteDrafts.current, ...drafts }),
    createShare: () => enqueueSave(saves().share),
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadHistory && history.isLoading,
      onViewAll: () => setShowingAllHistory(true),
      showingAll: showingAllHistory,
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
    saveFormAnswer: (itemId: string, fieldId: string, answer: FormAnswer | undefined) =>
      enqueueSave(saves().answer(itemId, fieldId, answer)),
    selectedData,
    selectedItemId,
    setSelectedItemId,
    stopSharing: () => enqueueSave(saves().stopSharing),
    completeRun: () => enqueueSave(saves().complete),
    toggleItem: async (itemId: string, isCompleted: boolean) => {
      const result = await enqueueSave(saves().toggleItem(itemId, isCompleted));
      const saved = result.kind === 'ok' ? result.run : undefined;
      if (saved) setSelectedItemId((current) => getSelectionAfterToggle(saved, itemId, current));
      return result;
    },
    toggleSubItem: (itemId: string, contentIndex: number, subItemIndex: number, isCompleted: boolean) =>
      enqueueSave(saves().toggleSubItem(itemId, contentIndex, subItemIndex, isCompleted)),
  };
};
