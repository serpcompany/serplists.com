import { skipToken } from '@tanstack/react-query';

import type { api, ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT, historyLimitFor } from '@/lib/schemas/historyLimits';
import { queryKeys } from '@/lib/queryCache';

import type { RunExecutionMode } from './runExecutionResult';

export const RUN_HISTORY_PREVIEW_LIMIT = HISTORY_DISPLAY_LIMIT;

type RunHistoryClient = Pick<typeof api, 'getChecklistHistory'>;

export const buildRunHistoryQuery = ({ runId, mode, client, showingAll = false }: {
  runId?: string | undefined;
  mode: RunExecutionMode;
  client: RunHistoryClient;
  showingAll?: boolean;
}) => {
  const limit = historyLimitFor(showingAll);
  const enabled = Boolean(runId && mode === 'private');
  return {
    queryKey: [...queryKeys.runHistory(runId ?? 'none'), { limit }],
    queryFn: runId && enabled ? (): Promise<ChecklistRunHistoryResponse> => client.getChecklistHistory(runId, { limit }) : skipToken,
    enabled,
    retry: false,
  } as const;
};

export const selectRunHistoryPreview = (
  history: ChecklistRunHistoryResponse | null | undefined,
  showingAll = false,
): TemplateHistoryEvent[] => (history?.events ?? []).slice(0, historyLimitFor(showingAll));
