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
  ])('%s', (_label, run, taskId, hasNext, expected) => {
    expect(getPrimaryTaskAction(run, taskId, hasNext)).toEqual(expected);
  });
});

describe('getPrimaryTaskAction for members who cannot update the run', () => {
  it('only navigates, and never offers to tick or finish', () => {
    expect(getPrimaryTaskAction(buildRun([false, false]), 'item-1', true, false)).toEqual({ kind: 'next_task' });
    expect(getPrimaryTaskAction(buildRun([true, true]), 'item-2', false, false)).toEqual({ kind: 'view_only' });
    expect(getPrimaryTaskAction(buildRun([false, false]), 'item-2', false, false)).toEqual({ kind: 'view_only' });
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
    onFinishRun: vi.fn(),
    onNavigateNext: vi.fn(),
    onSelectTask: vi.fn(),
    onToggleTask: vi.fn(),
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
