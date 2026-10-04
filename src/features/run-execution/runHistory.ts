import type { api, ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT, historyLimitFor } from '@/lib/schemas/historyLimits';
import { queryKeys } from '@/lib/queryCache';

export const RUN_HISTORY_PREVIEW_LIMIT = HISTORY_DISPLAY_LIMIT;

type RunHistoryClient = Pick<typeof api, 'getChecklistHistory'>;

export const buildRunHistoryQuery = (params: {
  runId?: string | undefined;
  mode: 'private' | 'shared';
  client: RunHistoryClient;
  showingAll?: boolean;
}) => ({
  queryKey: [...queryKeys.runHistory(params.runId ?? 'none'), { limit: historyLimitFor(params.showingAll ?? false) }],
  queryFn: (): Promise<ChecklistRunHistoryResponse> =>
    params.client.getChecklistHistory(params.runId ?? '', { limit: historyLimitFor(params.showingAll ?? false) }),
  enabled: Boolean(params.runId && params.mode !== 'shared'),
  retry: false,
});

export const selectRunHistoryPreview = (
  history: ChecklistRunHistoryResponse | null | undefined,
  showingAll = false,
): TemplateHistoryEvent[] => (history?.events ?? []).slice(0, historyLimitFor(showingAll));
