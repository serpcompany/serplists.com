import type { ChecklistRun } from '@/types/checklist';

import {
  areAllRunItemsCompleted,
  getNextSelectedItemId,
  getSelectedRunItem,
} from './runExecutionMappers';

// What the task panel's primary button does. Every action either calls a handler or
// renders disabled, so the button can never look clickable and do nothing.
export type PrimaryTaskAction =
  | { kind: 'complete_task' }
  | { kind: 'next_task' }
  | { kind: 'next_unfinished'; itemId: string }
  | { kind: 'finish_run' }
  | { kind: 'run_completed' }
  | { kind: 'view_only' };

export type PrimaryTaskButton = {
  disabled: boolean;
  icon: 'check' | 'next' | null;
  label: string;
  onClick?: () => void;
};

type PrimaryTaskHandlers = {
  // Marks the task complete (a set, not a flip: the button shows only for an open task).
  onCompleteTask: () => void;
  onFinishRun: () => void;
  onNavigateNext: () => void;
  onSelectTask: (itemId: string) => void;
};

// A run can be finished once every task is done. The server never completes a run on its
// own, so this stays true after a dismissed dialog, a reload, or tasks ticked over MCP.
// A run with no tasks has nothing to finish.
export const canFinishRun = (run: ChecklistRun): boolean =>
  run.status !== 'completed' &&
  run.sections.some((section) => section.items.length > 0) &&
  areAllRunItemsCompleted(run);

export const getPrimaryTaskAction = (
  run: ChecklistRun,
  taskId: string,
  hasNext: boolean,
  // False for Organization members whose role cannot update the run (viewers).
  canUpdate = true,
): PrimaryTaskAction => {
  // A completed run is frozen, even one saved with open tasks before that rule: it only
  // navigates.
  if (run.status === 'completed') {
    return hasNext ? { kind: 'next_task' } : { kind: 'run_completed' };
  }
  if (!canUpdate) {
    return hasNext ? { kind: 'next_task' } : { kind: 'view_only' };
  }
  if (!getSelectedRunItem(run, taskId)?.item.isCompleted) {
    return { kind: 'complete_task' };
  }
  if (canFinishRun(run)) {
    return { kind: 'finish_run' };
  }
  if (hasNext) {
    return { kind: 'next_task' };
  }
  const nextUnfinishedId = getNextSelectedItemId(run, taskId);
  return nextUnfinishedId !== taskId
    ? { kind: 'next_unfinished', itemId: nextUnfinishedId }
    : { kind: 'run_completed' };
};

export const getPrimaryTaskButton = (
  action: PrimaryTaskAction,
  handlers: PrimaryTaskHandlers,
): PrimaryTaskButton => {
  switch (action.kind) {
    case 'complete_task':
      return { disabled: false, icon: 'check', label: 'Mark Complete', onClick: handlers.onCompleteTask };
    case 'next_task':
      return { disabled: false, icon: 'next', label: 'Next Task', onClick: handlers.onNavigateNext };
    case 'next_unfinished':
      return {
        disabled: false,
        icon: 'next',
        label: 'Next unfinished task',
        onClick: () => handlers.onSelectTask(action.itemId),
      };
    case 'finish_run':
      return { disabled: false, icon: null, label: 'Finish Run', onClick: handlers.onFinishRun };
    case 'run_completed':
      return { disabled: true, icon: null, label: 'Run completed' };
    case 'view_only':
      return { disabled: true, icon: null, label: 'View only' };
  }
};
