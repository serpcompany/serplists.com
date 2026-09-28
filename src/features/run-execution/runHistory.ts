import type { api, ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';

// The run page shows the latest few events. Every progress save writes an audit event, so
// without a limit the API reads its default of 50 audit rows (plus their users) per view.
export const RUN_HISTORY_PREVIEW_LIMIT = 8;

type RunHistoryClient = Pick<typeof api, 'getChecklistHistory'>;

export const buildRunHistoryQuery = (params: {
  runId?: string;
  mode: 'private' | 'shared';
  client: RunHistoryClient;
}) => ({
  // The limit is part of the key, so a longer history view never reuses the preview entry.
  queryKey: ['checklist-run-history', params.runId ?? 'none', { limit: RUN_HISTORY_PREVIEW_LIMIT }],
  queryFn: (): Promise<ChecklistRunHistoryResponse> =>
    params.client.getChecklistHistory(params.runId ?? '', { limit: RUN_HISTORY_PREVIEW_LIMIT }),
  // Shared runs (share links) never load history.
  enabled: Boolean(params.runId && params.mode !== 'shared'),
  retry: false,
});

// Also bounds what is shown if a server ignores the limit.
export const selectRunHistoryPreview = (
  history: ChecklistRunHistoryResponse | null | undefined,
): TemplateHistoryEvent[] => (history?.events ?? []).slice(0, RUN_HISTORY_PREVIEW_LIMIT);
