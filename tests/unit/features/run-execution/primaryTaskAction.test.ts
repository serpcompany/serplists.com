import { describe, expect, it, vi } from 'vitest';

import {
  canFinishRun,
  getPrimaryTaskAction,
  getPrimaryTaskButton,
  type PrimaryTaskAction,
} from '@/features/run-execution/primaryTaskAction';
import type { ChecklistRun } from '@/types/checklist';

const buildRun = (
  completed: boolean[],
  status: ChecklistRun['status'] = 'in_progress',
): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch',
  status,
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: completed.map((isCompleted, index) => ({
        id: `item-${index + 1}`,
        title: `Task ${index + 1}`,
        isCompleted,
      })),
    },
  ],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
});

describe('getPrimaryTaskAction', () => {
  it.each<[string, ChecklistRun, string, boolean, PrimaryTaskAction]>([
    ['incomplete task', buildRun([false, false]), 'item-1', true, { kind: 'complete_task' }],
    ['complete task with a next task', buildRun([true, false]), 'item-1', true, { kind: 'next_task' }],
    ['every task done on the last task', buildRun([true, true]), 'item-2', false, { kind: 'finish_run' }],
    ['every task done before the last task', buildRun([true, true]), 'item-1', true, { kind: 'finish_run' }],
    [
      'last task done while an earlier task is open',
      buildRun([false, true]),
      'item-2',
      false,
      { kind: 'next_unfinished', itemId: 'item-1' },
    ],
    ['completed run on the last task', buildRun([true, true], 'completed'), 'item-2', false, { kind: 'run_completed' }],
    ['completed run with a next task', buildRun([true, true], 'completed'), 'item-1', true, { kind: 'next_task' }],
    // A completed run is frozen, even one saved with open tasks before this rule existed.
    ['open task on a completed run', buildRun([false, true], 'completed'), 'item-1', true, { kind: 'next_task' }],
    ['open last task on a completed run', buildRun([true, false], 'completed'), 'item-2', false, { kind: 'run_completed' }],
    ['done last task on a completed run with an open task', buildRun([false, true], 'completed'), 'item-2', false, { kind: 'run_completed' }],
  ])('%s', (_label, run, taskId, hasNext, expected) => {
    expect(getPrimaryTaskAction(run, taskId, hasNext)).toEqual(expected);
  });
});

// A task can be ticked while one of its Sub-tasks is still open (runs saved before a task
// followed its Sub-tasks, or written through the API). That task is not done and the run
// cannot be finished yet, so the button leads to it and never reads "Run completed".
describe('getPrimaryTaskAction with a ticked task whose Sub-task is still open', () => {
  const subTasks = (...done: boolean[]) => ({
    type: 'subItems' as const,
    value: '',
    subItems: done.map((isCompleted, index) => ({ id: `sub-${index + 1}`, title: `Sub-task ${index + 1}`, isCompleted })),
  });
  // Every task ticked; the task at openIndex has a done Sub-tasks block and an open one.
  const withOpenSubTask = (openIndex: number): ChecklistRun => {
    const run = buildRun([true, true, true]);
    run.sections[0].items[openIndex].contents = [subTasks(true), subTasks(true, false)];
    return run;
  };

  it('leads from the last task to the earlier task with the open Sub-task', () => {
    const run = withOpenSubTask(0);

    expect(canFinishRun(run)).toBe(false);
    expect(getPrimaryTaskAction(run, 'item-3', false)).toEqual({ kind: 'next_unfinished', itemId: 'item-1' });
  });

  it('offers Mark Complete on the task with the open Sub-task, also when it is the last task', () => {
    expect(getPrimaryTaskAction(withOpenSubTask(2), 'item-3', false)).toEqual({ kind: 'complete_task' });
    expect(getPrimaryTaskAction(withOpenSubTask(1), 'item-2', true)).toEqual({ kind: 'complete_task' });
  });

  it('still moves on from a done task that has a next one', () => {
    expect(getPrimaryTaskAction(withOpenSubTask(2), 'item-1', true)).toEqual({ kind: 'next_task' });
  });

  it('treats a ticked task with an empty Sub-tasks block as done', () => {
    const run = buildRun([true, true]);
    run.sections[0].items[0].contents = [subTasks()];

    expect(getPrimaryTaskAction(run, 'item-2', false)).toEqual({ kind: 'finish_run' });
  });

  it('never reads "Run completed" on a run that is still in progress', () => {
    // Every combination of three tasks and one Sub-task each, ticked or not, on every task.
    for (let mask = 0; mask < 64; mask += 1) {
      const run = buildRun([0, 1, 2].map((index) => (mask & (1 << index)) !== 0));
      run.sections[0].items.forEach((item, index) => {
        item.contents = [subTasks((mask & (1 << (index + 3))) !== 0)];
      });
      run.sections[0].items.forEach((item, index) => {
        expect(getPrimaryTaskAction(run, item.id, index < 2).kind, `mask ${mask}, ${item.id}`).not.toBe('run_completed');
      });
    }
  });
});

describe('getPrimaryTaskAction for members who cannot update the run', () => {
  it('only navigates, and never offers to tick or finish', () => {
    expect(getPrimaryTaskAction(buildRun([false, false]), 'item-1', true, false)).toEqual({ kind: 'next_task' });
    expect(getPrimaryTaskAction(buildRun([true, true]), 'item-2', false, false)).toEqual({ kind: 'view_only' });
    expect(getPrimaryTaskAction(buildRun([false, false]), 'item-2', false, false)).toEqual({ kind: 'view_only' });
    expect(getPrimaryTaskAction(buildRun([true, true], 'completed'), 'item-2', false, false)).toEqual({ kind: 'run_completed' });
  });
});

describe('canFinishRun', () => {
  it('is true only for an in-progress run whose tasks are all done', () => {
    expect(canFinishRun(buildRun([true, true]))).toBe(true);
    expect(canFinishRun(buildRun([true, false]))).toBe(false);
    expect(canFinishRun(buildRun([true, true], 'completed'))).toBe(false);
  });

  it('does not offer to finish a run that has no tasks', () => {
    expect(canFinishRun(buildRun([]))).toBe(false);
  });
});

describe('getPrimaryTaskButton', () => {
  const handlers = () => ({
    onCompleteTask: vi.fn(),
    onFinishRun: vi.fn(),
    onNavigateNext: vi.fn(),
    onSelectTask: vi.fn(),
  });

  it('marks the task complete from "Mark Complete"', () => {
    const callbacks = handlers();
    const button = getPrimaryTaskButton({ kind: 'complete_task' }, callbacks);

    expect(button.label).toBe('Mark Complete');
    button.onClick?.();
    expect(callbacks.onCompleteTask).toHaveBeenCalledOnce();
  });

  it('calls onFinishRun from "Finish Run"', () => {
    const callbacks = handlers();
    const button = getPrimaryTaskButton({ kind: 'finish_run' }, callbacks);

    expect(button.label).toBe('Finish Run');
    button.onClick?.();
    expect(callbacks.onFinishRun).toHaveBeenCalledOnce();
  });

  it('selects the open task from "Next unfinished task"', () => {
    const callbacks = handlers();
    const button = getPrimaryTaskButton({ kind: 'next_unfinished', itemId: 'item-1' }, callbacks);

    expect(button.label).toBe('Next unfinished task');
    button.onClick?.();
    expect(callbacks.onSelectTask).toHaveBeenCalledWith('item-1');
  });

  it('never renders an enabled button that does nothing', () => {
    const actions: PrimaryTaskAction[] = [
      { kind: 'complete_task' },
      { kind: 'next_task' },
      { kind: 'next_unfinished', itemId: 'item-1' },
      { kind: 'finish_run' },
      { kind: 'run_completed' },
      { kind: 'view_only' },
    ];

    for (const action of actions) {
      const callbacks = handlers();
      const button = getPrimaryTaskButton(action, callbacks);
      if (button.disabled) {
        expect(button.onClick).toBeUndefined();
        continue;
      }
      button.onClick?.();
      const calls = Object.values(callbacks).reduce((total, fn) => total + fn.mock.calls.length, 0);
      expect(calls, action.kind).toBe(1);
    }
  });
});
