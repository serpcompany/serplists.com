import { describe, expect, it } from 'vitest';
import { completionStamps, findRunCompletionRefusal } from '@functions/api/utils/run-completion';

const NOW = '2026-10-01T00:00:00.000Z';
const stamps = (fields: Partial<Parameters<typeof completionStamps>[0]>) =>
  completionStamps({ currentStatus: 'in_progress', currentCompletedAt: null, nextStatus: 'completed', userId: 'user-1', now: NOW, ...fields });

describe('findRunCompletionRefusal', () => {
  it('refuses to complete a run with no tasks', () => {
    expect(findRunCompletionRefusal([{ id: 's1', title: 'Empty', items: [] }])).toEqual({
      message: 'This run has no tasks to complete',
      openTaskIds: [],
    });
  });

  it('completes a run whose every task is done', () => {
    expect(findRunCompletionRefusal([{ id: 's1', title: 'Done', items: [{ id: 't1', title: 'Ship', isCompleted: true }] }])).toBeNull();
  });
});

describe('completionStamps', () => {
  it('stamps nothing unless the save completes the run', () => {
    expect(stamps({ nextStatus: 'in_progress' })).toEqual({});
  });

  it('stamps the time asked for, or now, and who completed the run', () => {
    expect(stamps({ requestedCompletedAt: '2026-09-30T12:00:00.000Z' })).toEqual({ completed_at: '2026-09-30T12:00:00.000Z', completed_by_user_id: 'user-1' });
    expect(stamps({ userId: null })).toEqual({ completed_at: NOW, completed_by_user_id: null });
  });

  it('keeps the first completion of a run saved as completed again', () => {
    expect(stamps({ currentStatus: 'completed', currentCompletedAt: '2026-09-01T00:00:00.000Z' })).toEqual({});
  });

  it('dates a run stored completed without a completion date', () => {
    expect(stamps({ currentStatus: 'completed', currentCompletedAt: null })).toEqual({ completed_at: NOW });
  });
});
