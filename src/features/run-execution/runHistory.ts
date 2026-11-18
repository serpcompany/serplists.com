import { skipToken, type SkipToken } from '@tanstack/react-query';

import type { api, ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT, historyLimitFor } from '@/lib/schemas/historyLimits';
import { queryKeys } from '@/lib/queryCache';

import type { RunExecutionMode } from './runExecutionResult';

export const RUN_HISTORY_PREVIEW_LIMIT = HISTORY_DISPLAY_LIMIT;

type RunHistoryClient = Pick<typeof api, 'getChecklistHistory'>;

export const buildRunHistoryQuery = (params: {
  runId?: string | undefined;
  mode: RunExecutionMode;
  client: RunHistoryClient;
  showingAll?: boolean;
}): {
  queryKey: (string | { limit: number })[];
  queryFn: SkipToken | (() => Promise<ChecklistRunHistoryResponse>);
  enabled: boolean;
  retry: boolean;
} => {
  const { runId } = params;
  const limit = historyLimitFor(params.showingAll ?? false);
  return {
    queryKey: [...queryKeys.runHistory(runId ?? 'none'), { limit }],
    queryFn: runId === undefined ? skipToken : () => params.client.getChecklistHistory(runId, { limit }),
    enabled: Boolean(runId && params.mode === 'private'),
    retry: false,
  };
};

export const selectRunHistoryPreview = (
  history: ChecklistRunHistoryResponse | null | undefined,
  showingAll = false,
): TemplateHistoryEvent[] => (history?.events ?? []).slice(0, historyLimitFor(showingAll));
