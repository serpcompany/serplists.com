import type { api, ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';
import { queryKeys } from '@/lib/queryCache';

export const RUN_HISTORY_PREVIEW_LIMIT = HISTORY_DISPLAY_LIMIT;

type RunHistoryClient = Pick<typeof api, 'getChecklistHistory'>;

export const buildRunHistoryQuery = (params: {
  runId?: string;
  mode: 'private' | 'shared';
  client: RunHistoryClient;
}) => ({
  queryKey: [...queryKeys.runHistory(params.runId ?? 'none'), { limit: RUN_HISTORY_PREVIEW_LIMIT }],
  queryFn: (): Promise<ChecklistRunHistoryResponse> =>
    params.client.getChecklistHistory(params.runId ?? '', { limit: RUN_HISTORY_PREVIEW_LIMIT }),
  enabled: Boolean(params.runId && params.mode !== 'shared'),
  retry: false,
});

export const selectRunHistoryPreview = (
  history: ChecklistRunHistoryResponse | null | undefined,
): TemplateHistoryEvent[] => (history?.events ?? []).slice(0, RUN_HISTORY_PREVIEW_LIMIT);
