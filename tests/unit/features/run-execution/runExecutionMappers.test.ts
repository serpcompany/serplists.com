import { describe, expect, it } from 'vitest';

import { areAllRunItemsCompleted, getNextSelectedItemId } from '@/features/run-execution/runExecutionMappers';
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

describe('areAllRunItemsCompleted', () => {
  const withSubTask = (subTaskDone: boolean): ChecklistRun =>
    ({
      id: 'run-1',
      sections: [{
        id: 's1',
        title: 'One',
        items: [{
          id: 'a',
          title: 'a',
          isCompleted: true,
          contents: [{ id: 'c1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Tagline', isCompleted: subTaskDone }] }],
        }],
      }],
    }) as unknown as ChecklistRun;

  it('is false while a ticked task still has an unfinished Sub-task', () => {
    expect(areAllRunItemsCompleted(withSubTask(false))).toBe(false);
    expect(areAllRunItemsCompleted(withSubTask(true))).toBe(true);
  });
});
