import { describe, expect, it, vi } from 'vitest';

import type { ChecklistRunHistoryResponse, TemplateHistoryEvent } from '@/lib/api';
import {
  RUN_HISTORY_PREVIEW_LIMIT,
  buildRunHistoryQuery,
  selectRunHistoryPreview,
} from '@/features/run-execution/runHistory';

const event = (index: number): TemplateHistoryEvent =>
  ({
    id: `event-${index}`,
    action: 'checklist_run.updated',
    createdAt: '2026-07-03T12:00:00.000Z',
  }) as TemplateHistoryEvent;

const response = (count: number): ChecklistRunHistoryResponse => ({
  checklistId: 'run-1',
  subject: { type: 'user', id: 'user-1' },
  events: Array.from({ length: count }, (_, index) => event(index)),
});

describe('run history query', () => {
  it("requests only the events the page shows, instead of the server's default of 50 audit rows and their users", async () => {
    const client = { getChecklistHistory: vi.fn().mockResolvedValue(response(8)) };
    const query = buildRunHistoryQuery({ runId: 'run-1', mode: 'private', client });

    await query.queryFn();

    expect(RUN_HISTORY_PREVIEW_LIMIT).toBe(8);
    expect(client.getChecklistHistory).toHaveBeenCalledWith('run-1', { limit: RUN_HISTORY_PREVIEW_LIMIT });
    expect(query.enabled).toBe(true);
  });

  it("keys the cache under the run's Changelog key, which the run page's saves refresh, and by limit, so a longer history never reuses the preview entry", () => {
    const client = { getChecklistHistory: vi.fn() };
    const query = buildRunHistoryQuery({ runId: 'run-1', mode: 'private', client });

    expect(query.queryKey).toEqual(['checklist-run-history', 'run-1', { limit: RUN_HISTORY_PREVIEW_LIMIT }]);
  });

  it('never loads history for a shared run or before the run is known', () => {
    const client = { getChecklistHistory: vi.fn() };

    expect(buildRunHistoryQuery({ runId: 'run-1', mode: 'shared', client }).enabled).toBe(false);
    expect(buildRunHistoryQuery({ runId: undefined, mode: 'private', client }).enabled).toBe(false);
  });

  it('shows at most the preview limit, even if an older server ignores it', () => {
    expect(selectRunHistoryPreview(response(50))).toHaveLength(RUN_HISTORY_PREVIEW_LIMIT);
    expect(selectRunHistoryPreview(response(3))).toHaveLength(3);
    expect(selectRunHistoryPreview(null)).toEqual([]);
  });
});
