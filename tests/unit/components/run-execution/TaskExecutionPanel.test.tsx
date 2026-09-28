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

const renderPanel = (task: ChecklistItem, primaryAction: PrimaryTaskAction) => {
  const onToggleTask = vi.fn();
  const onToggleSubItem = vi.fn();
  const tree = TaskExecutionPanel({
    hasNext: true,
    hasPrev: false,
    onFinishRun: vi.fn(),
    onNavigateNext: vi.fn(),
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
  });
  const click = (label: string) => {
    const [button] = findElements(tree, (element) => typeof element.props.onClick === 'function' && textOf(element) === label);
    (button?.props.onClick as () => void)();
  };
  const taskCheckbox = () => {
    const [button] = findElements(tree, (element) => element.type === 'button');
    (button?.props.onClick as () => void)();
  };
  const subTaskHandler = () => {
    const [renderer] = findElements(tree, (element) => typeof element.props.onSubItemToggle === 'function');
    return renderer?.props.onSubItemToggle as (contentIndex: number, subItemIndex: number, isCompleted: boolean) => void;
  };
  return { click, onToggleSubItem, onToggleTask, subTaskHandler, taskCheckbox };
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
