import { describe, expect, it } from 'vitest';

import { getNextSelectedItemId, mapChecklistToRun } from '@/features/run-execution/runExecutionMappers';
import { serializeSharedChecklistRun } from '@functions/api/utils/checklist-runs';
import type { ChecklistRun } from '@/types/checklist';

const run = (completed: string[]): ChecklistRun =>
  ({
    id: 'run-1',
    sections: [
      { id: 's1', title: 'One', items: ['a', 'b'].map((id) => ({ id, title: id, isCompleted: completed.includes(id) })) },
      { id: 's2', title: 'Two', items: ['c', 'd'].map((id) => ({ id, title: id, isCompleted: completed.includes(id) })) },
    ],
  }) as unknown as ChecklistRun;

describe('getNextSelectedItemId', () => {
  it('moves to the next unfinished task, across sections', () => {
    expect(getNextSelectedItemId(run(['a']), 'a')).toBe('b');
    expect(getNextSelectedItemId(run(['a', 'b']), 'b')).toBe('c');
  });

  it('skips finished tasks and wraps to earlier unfinished ones', () => {
    expect(getNextSelectedItemId(run(['a', 'c', 'd']), 'c')).toBe('b');
    expect(getNextSelectedItemId(run(['b', 'c', 'd']), 'd')).toBe('a');
  });

  it('stays on the task when every task is done', () => {
    expect(getNextSelectedItemId(run(['a', 'b', 'c', 'd']), 'd')).toBe('d');
  });
});

describe('mapChecklistToRun', () => {
  it('maps the share-link payload, which carries no owner or template ids', () => {
    const shared = serializeSharedChecklistRun({
      id: 'run-1',
      title: 'Shared Run',
      items: JSON.stringify([{ id: 's1', title: 'One', items: [{ id: 'a', title: 'A', isCompleted: true }, { id: 'b', title: 'B' }] }]),
      status: 'in_progress',
      progress: 50,
      started_at: '2026-01-01T00:00:00.000Z',
      completed_at: null,
      revision: 4,
      template_version: 2,
      current_template_version: 2,
    });

    const mapped = mapChecklistToRun(shared, 'share-token');

    expect(mapped).toMatchObject({
      id: 'run-1',
      title: 'Shared Run',
      status: 'in_progress',
      progress: 50,
      startedAt: '2026-01-01T00:00:00.000Z',
      revision: 4,
      templateVersion: 2,
      isStale: false,
      userId: '',
      templateId: '',
    });
    expect(mapped.sections[0].items.map((item) => item.isCompleted)).toEqual([true, false]);
  });
});
