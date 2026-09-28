import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import type { PrimaryTaskAction } from '@/features/run-execution/primaryTaskAction';
import type { ChecklistItem } from '@/types/checklist';

type AnyElement = React.ReactElement<Record<string, unknown>>;

// Walks the element tree the panel returns (its own markup, not its children's render).
const findElements = (node: unknown, match: (element: AnyElement) => boolean): AnyElement[] => {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, match));
  if (!React.isValidElement(node)) return [];
  const element = node as AnyElement;
  return [...(match(element) ? [element] : []), ...findElements(element.props.children, match)];
};

const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return React.isValidElement(node) ? textOf((node as AnyElement).props.children) : '';
};

// A click's `detail` is its click count: 1 for a single click, 2 for the second click of a
// double click, 0 for keyboard activation.
type Click = (event: { detail: number }) => void;

const renderPanel = (
  task: ChecklistItem,
  primaryAction: PrimaryTaskAction,
  extra: Partial<Parameters<typeof TaskExecutionPanel>[0]> = {},
) => {
  const onToggleTask = vi.fn();
  const onToggleSubItem = vi.fn();
  const onNavigateNext = vi.fn();
  const tree = TaskExecutionPanel({
    hasNext: true,
    hasPrev: false,
    onFinishRun: vi.fn(),
    onNavigateNext,
    onNavigatePrev: vi.fn(),
    onNotesDraftChange: vi.fn(),
    onSaveNotes: vi.fn(async () => true),
    onSelectTask: vi.fn(),
    onToggleSubItem,
    onToggleTask,
    primaryAction,
    section: { id: 'section-1', title: 'Checklist', items: [task] },
    task,
    taskIndex: 0,
    totalTasks: 1,
    ...extra,
  });
  const click = (label: string, detail = 1) => {
    const [button] = findElements(tree, (element) => typeof element.props.onClick === 'function' && textOf(element) === label);
    (button?.props.onClick as Click)({ detail });
  };
  const taskCheckbox = (detail = 1) => {
    const [button] = findElements(tree, (element) => element.type === 'button');
    (button?.props.onClick as Click)({ detail });
  };
  const subTaskHandler = () => {
    const [renderer] = findElements(tree, (element) => typeof element.props.onSubItemToggle === 'function');
    return renderer?.props.onSubItemToggle as (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  };
  return { click, onNavigateNext, onToggleSubItem, onToggleTask, subTaskHandler, taskCheckbox, tree };
};

const openTask: ChecklistItem = {
  id: 'task-1',
  title: 'Task',
  isCompleted: false,
  contents: [{ type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', isCompleted: false }] }],
};

describe('TaskExecutionPanel sends the value the user clicked', () => {
  it('Mark Complete asks to complete the task, never to flip it', () => {
    const panel = renderPanel(openTask, { kind: 'complete_task' });
    panel.click('Mark Complete');
    expect(panel.onToggleTask).toHaveBeenCalledWith(true);
  });

  it('the task checkbox asks for the opposite of what it shows', () => {
    const open = renderPanel(openTask, { kind: 'complete_task' });
    open.taskCheckbox();
    expect(open.onToggleTask).toHaveBeenCalledWith(true);

    const done = renderPanel({ ...openTask, isCompleted: true }, { kind: 'next_task' });
    done.taskCheckbox();
    expect(done.onToggleTask).toHaveBeenCalledWith(false);
  });

  it('passes the sub-task value from ContentRenderer through to the page', () => {
    const panel = renderPanel(openTask, { kind: 'complete_task' });
    panel.subTaskHandler()(0, 0, true);
    expect(panel.onToggleSubItem).toHaveBeenCalledWith(0, 0, true);
  });
});

// The primary button and the task checkbox change what they do under the pointer: Next Task
// shows the open next task (whose button reads Mark Complete), and a completed task moves
// on to the next one. The second click of a double click must not act on that new task.
describe('TaskExecutionPanel ignores the second click of a double click', () => {
  it('a double click on Next Task moves on without completing the next task', () => {
    const done = renderPanel({ ...openTask, isCompleted: true }, { kind: 'next_task' });
    done.click('Next Task', 1);
    expect(done.onNavigateNext).toHaveBeenCalledTimes(1);

    // The page re-rendered for the open next task before the second click arrived.
    const next = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    next.click('Mark Complete', 2);
    expect(next.onToggleTask).not.toHaveBeenCalled();
  });

  it('a repeat click on Mark Complete after a fast save does not complete the next task', () => {
    const next = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    next.click('Mark Complete', 2);
    next.click('Mark Complete', 3);
    expect(next.onToggleTask).not.toHaveBeenCalled();
  });

  it('the task checkbox ignores the repeat click too', () => {
    const next = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    next.taskCheckbox(2);
    expect(next.onToggleTask).not.toHaveBeenCalled();
  });

  it('keyboard activation (detail 0) still acts', () => {
    const panel = renderPanel(openTask, { kind: 'complete_task' });
    panel.click('Mark Complete', 0);
    panel.taskCheckbox(0);
    expect(panel.onToggleTask).toHaveBeenCalledTimes(2);

    const done = renderPanel({ ...openTask, isCompleted: true }, { kind: 'next_task' });
    done.click('Next Task', 0);
    expect(done.onNavigateNext).toHaveBeenCalledTimes(1);
  });
});

describe('TaskExecutionPanel on a completed run', () => {
  it('locks the task and sub-task checkboxes, and keeps notes editable', () => {
    const { tree } = renderPanel(openTask, { kind: 'run_completed' }, { runCompleted: true });
    const [taskCheckbox] = findElements(tree, (element) => element.type === 'button');
    const [renderer] = findElements(tree, (element) => typeof element.props.onSubItemToggle === 'function');
    const [notes] = findElements(tree, (element) => element.props.label === 'Task notes');

    expect(taskCheckbox?.props.disabled).toBe(true);
    expect(renderer?.props.disabled).toBe(true);
    expect(notes?.props.readOnly).toBe(false);
  });

  it('leaves an in-progress run tickable', () => {
    const { tree } = renderPanel(openTask, { kind: 'complete_task' });
    const [taskCheckbox] = findElements(tree, (element) => element.type === 'button');

    expect(taskCheckbox?.props.disabled).toBe(false);
  });
});
