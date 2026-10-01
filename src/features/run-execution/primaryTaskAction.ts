import type { ChecklistRun } from '@/types/checklist';

import {
  areAllRunItemsCompleted,
  getNextSelectedItemId,
  getSelectedRunItem,
  isRunItemFinished,
} from './runExecutionMappers';

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
  onCompleteTask: () => void;
  onFinishRun: () => void;
  onNavigateNext: () => void;
  onSelectTask: (itemId: string) => void;
};

export const canFinishRun = (run: ChecklistRun): boolean =>
  run.status !== 'completed' &&
  run.sections.some((section) => section.items.length > 0) &&
  areAllRunItemsCompleted(run);

export const getPrimaryTaskAction = (
  run: ChecklistRun,
  taskId: string,
  hasNext: boolean,
  canUpdate = true,
): PrimaryTaskAction => {
  if (run.status === 'completed') {
    return hasNext ? { kind: 'next_task' } : { kind: 'run_completed' };
  }
  if (!canUpdate) {
    return hasNext ? { kind: 'next_task' } : { kind: 'view_only' };
  }
  const selected = getSelectedRunItem(run, taskId)?.item;
  if (!selected || !isRunItemFinished(selected)) {
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
    : { kind: 'complete_task' };
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
