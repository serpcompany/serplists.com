import { describe, expect, it } from 'vitest';

import {
  areItemSubItemsCompleted,
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
