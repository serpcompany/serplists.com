import { describe, expect, it } from 'vitest';

import { calculateRunProgress } from '@functions/api/utils/template-reconciliation';
import {
  areItemSubItemsCompleted,
  countRunExecutionItems,
  getNextSelectedItemId,
  getSelectionAfterToggle,
  mapChecklistToRun,
} from '@/features/run-execution/runExecutionMappers';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';

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

// The auto-advance after a toggle runs when the save lands, as a state updater, so it sees
// the task the user moved to while the save was in flight, not the one they clicked on.
describe('getSelectionAfterToggle', () => {
  it('moves on from a completed task that is still selected', () => {
    expect(getSelectionAfterToggle(run(['a']), 'a', 'a')).toBe('b');
    expect(getSelectionAfterToggle(run(['a', 'c', 'd']), 'c', 'c')).toBe('b');
  });

  it('keeps the task the user moved to while the save was in flight', () => {
    // Mark Complete on A, then D picked in the Progress panel (or Previous) before the save lands.
    expect(getSelectionAfterToggle(run(['a']), 'a', 'd')).toBe('d');
    expect(getSelectionAfterToggle(run(['c']), 'c', 'b')).toBe('b');
  });

  it('never moves back to an earlier task when queued completions land', () => {
    // Complete A, Next to B, complete B, Next to C; then save A lands, then save B.
    let selected = 'c';
    selected = getSelectionAfterToggle(run(['a']), 'a', selected);
    expect(selected).toBe('c');
    selected = getSelectionAfterToggle(run(['a', 'b']), 'b', selected);
    expect(selected).toBe('c');
  });

  it('moves on when the user came back to the completed task before the save landed', () => {
    expect(getSelectionAfterToggle(run(['a']), 'a', 'a')).toBe('b');
  });

  it('does not move after an untick', () => {
    expect(getSelectionAfterToggle(run([]), 'a', 'a')).toBe('a');
    expect(getSelectionAfterToggle(run([]), 'a', 'c')).toBe('c');
  });

  it('stays on the task when every task is done, so the completion prompt shows over it', () => {
    expect(getSelectionAfterToggle(run(['a', 'b', 'c', 'd']), 'd', 'd')).toBe('d');
  });

  it('leaves the selection alone when the toggled task is no longer in the run', () => {
    expect(getSelectionAfterToggle(run(['a']), 'gone', 'a')).toBe('a');
    expect(getSelectionAfterToggle(run(['a']), 'a', null)).toBeNull();
  });
});

describe('mapChecklistToRun', () => {
  it('keeps the Organization that owns the run, so the page can check the member role', () => {
    expect(mapChecklistToRun({ id: 'run-1', team_id: 'team-1', items: '[]' }, 'run-1').teamId).toBe('team-1');
    expect(mapChecklistToRun({ id: 'run-2', team_id: null, items: '[]' }, 'run-2').teamId).toBeUndefined();
  });
});


describe('areItemSubItemsCompleted', () => {
  const item = (contents: ChecklistItem['contents']): ChecklistItem => ({ id: 'task', title: 'Task', contents });
  const block = (...done: (boolean | undefined)[]) => ({
    type: 'subItems' as const,
    value: '',
    subItems: done.map((isCompleted, index) => ({ id: `s${index}`, title: `S${index}`, isCompleted })),
  });

  it('is false for a task with no sub-tasks at all', () => {
    expect(areItemSubItemsCompleted(item(undefined))).toBe(false);
    expect(areItemSubItemsCompleted(item([]))).toBe(false);
    expect(areItemSubItemsCompleted(item([{ type: 'text', value: 'hi' }]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(), { type: 'subItems', value: '' }]))).toBe(false);
  });

  it('counts the sub-tasks of every block, not just one', () => {
    expect(areItemSubItemsCompleted(item([block(false, false), block(true)]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(true, false), block(true)]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(true, true), block(true)]))).toBe(true);
  });

  it('ignores empty blocks and other content next to ticked ones', () => {
    expect(
      areItemSubItemsCompleted(item([block(true), { type: 'text', value: 'x' }, block(), { type: 'subItems', value: '' }])),
    ).toBe(true);
  });

  it('treats a sub-task with no completion flag as open', () => {
    expect(areItemSubItemsCompleted(item([block(true, undefined)]))).toBe(false);
  });
});

// "Tasks" on the run page are top-level tasks, as in the task list, "Task N of M" and the
// runs list. Sub-tasks are counted apart; progress still weights both, like the API.
describe('countRunExecutionItems', () => {
  const task = (id: string, subTasks: boolean[], isCompleted = false): ChecklistItem => ({
    id,
    title: id,
    isCompleted,
    contents: [
      {
        type: 'subItems',
        value: '',
        subItems: subTasks.map((done, index) => ({ id: `${id}-${index}`, title: `${id} ${index}`, isCompleted: done })),
      },
    ],
  });
  const runOf = (...items: ChecklistItem[]): ChecklistRun =>
    ({ id: 'run-1', sections: [{ id: 's1', title: 'One', items }] }) as unknown as ChecklistRun;

  it('counts tasks and sub-tasks separately', () => {
    const counts = countRunExecutionItems(runOf(task('a', [false, false, false]), task('b', [false, false, false]), task('c', [false, false, false])));
    expect(counts).toEqual({ progress: 0, subTasksCompleted: 0, subTasksTotal: 9, tasksCompleted: 0, tasksTotal: 3 });
  });

  it('does not count a ticked sub-task as a finished task', () => {
    const counts = countRunExecutionItems(runOf(task('a', [true, false, false]), task('b', [false, false, false]), task('c', [false, false, false])));
    expect(counts).toMatchObject({ subTasksCompleted: 1, tasksCompleted: 0, tasksTotal: 3 });
    expect(counts.progress).toBe(8);
  });

  it('sums every Sub-tasks block of a task and skips other content', () => {
    const item: ChecklistItem = {
      id: 'a',
      title: 'a',
      isCompleted: false,
      contents: [
        { type: 'text', value: 'Read me' },
        { type: 'subItems', value: '', subItems: [{ id: 'a-1', title: 'one', isCompleted: true }] },
        { type: 'subItems', value: '' },
        { type: 'subItems', value: '', subItems: [{ id: 'a-2', title: 'two', isCompleted: false }] },
      ],
    };
    expect(countRunExecutionItems(runOf(item, { id: 'b', title: 'b', isCompleted: true }))).toEqual({
      progress: 50,
      subTasksCompleted: 1,
      subTasksTotal: 2,
      tasksCompleted: 1,
      tasksTotal: 2,
    });
  });

  it('returns zeros for no run or a run with no tasks', () => {
    const zero = { progress: 0, subTasksCompleted: 0, subTasksTotal: 0, tasksCompleted: 0, tasksTotal: 0 };
    expect(countRunExecutionItems(null)).toEqual(zero);
    expect(countRunExecutionItems(runOf())).toEqual(zero);
    expect(countRunExecutionItems({ id: 'run-1', sections: [] } as unknown as ChecklistRun)).toEqual(zero);
  });

  it('weights progress the same way as the API that stores it', () => {
    const patterns: ChecklistItem[][] = [
      [task('a', [true, false, false]), task('b', [false, false, false]), task('c', [false, false, false])],
      [task('a', [true, true, true], true), task('b', [true, false]), { id: 'c', title: 'c', isCompleted: true }],
      [task('a', [false], true), { id: 'b', title: 'b', isCompleted: false }],
      [{ id: 'a', title: 'a', isCompleted: true }],
    ];
    for (const items of patterns) {
      const run = runOf(...items);
      expect(countRunExecutionItems(run).progress).toBe(calculateRunProgress(run.sections));
    }
  });
});
