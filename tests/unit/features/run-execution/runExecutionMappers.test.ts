import { describe, expect, it } from 'vitest';

import { getNextSelectedItemId, mapChecklistToRun } from '@/features/run-execution/runExecutionMappers';
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
  it('keeps the Organization that owns the run, so the page can check the member role', () => {
    expect(mapChecklistToRun({ id: 'run-1', team_id: 'team-1', items: '[]' }, 'run-1').teamId).toBe('team-1');
    expect(mapChecklistToRun({ id: 'run-2', team_id: null, items: '[]' }, 'run-2').teamId).toBeUndefined();
  });
});

