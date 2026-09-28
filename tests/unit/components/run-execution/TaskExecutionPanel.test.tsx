import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { TaskHeaderReveal } from '@/components/run-execution/TaskHeaderReveal';
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

// The task toggle is the only control that unticks a completed task (the footer button
// becomes Next Task), so assistive technology must hear its name and its checked state.
describe('TaskExecutionPanel task checkbox is accessible', () => {
  const toggleOf = (tree: unknown) => findElements(tree, (element) => element.props.role === 'checkbox');
  const namelessButtons = (html: string) =>
    (html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/gs) ?? []).filter(
      (button) => !/aria-label="[^"]+"/.test(button) && !/aria-labelledby="[^"]+"/.test(button) && button.replace(/<[^>]*>/g, '').trim() === '',
    );

  it('is a checkbox named after the task that shows it is not done', () => {
    const { tree } = renderPanel({ ...openTask, title: 'Review all page content' }, { kind: 'complete_task' });
    const [toggle] = toggleOf(tree);

    expect(toggle?.type).toBe('button');
    expect(toggle?.props['aria-checked']).toBe(false);
    expect(toggle?.props['aria-label']).toBe('Mark "Review all page content" complete');
  });

  it('shows that a completed task is checked, under the same name', () => {
    const { tree } = renderPanel({ ...openTask, title: 'Review all page content', isCompleted: true }, { kind: 'next_task' });
    const [toggle] = toggleOf(tree);

    expect(toggle?.props['aria-checked']).toBe(true);
    expect(toggle?.props['aria-label']).toBe('Mark "Review all page content" complete');
  });

  it('never has a blank name, even for an untitled task', () => {
    const { tree } = renderPanel({ ...openTask, title: '   ' }, { kind: 'complete_task' }, { taskIndex: 2 });
    expect(toggleOf(tree)[0]?.props['aria-label']).toBe('Mark "Task 3" complete');
  });

  it('renders no button without a name', () => {
    for (const task of [openTask, { ...openTask, isCompleted: true }, { ...openTask, contents: [] }]) {
      const html = renderToStaticMarkup(renderPanel(task, { kind: 'complete_task' }).tree);
      expect(html).toContain('role="checkbox"');
      expect(namelessButtons(html)).toEqual([]);
    }
  });
});

// The window scrolls, and the panel stays mounted while the task inside it changes, so the
// header reveals each new task: scrolled to below the sticky site headers, title focused.
describe('TaskExecutionPanel reveals the task it moves to', () => {
  it('wraps the task header in a reveal keyed on the task id', () => {
    const { tree } = renderPanel({ ...openTask, id: 'task-7' }, { kind: 'complete_task' });
    const reveals = findElements(tree, (element) => element.type === TaskHeaderReveal);

    expect(reveals).toHaveLength(1);
    expect(reveals[0]?.props.taskId).toBe('task-7');
    // The task title and its checkbox are inside the revealed header.
    expect(findElements(reveals[0], (element) => element.type === 'h2')).toHaveLength(1);
    expect(findElements(reveals[0], (element) => element.props.role === 'checkbox')).toHaveLength(1);
  });

  it('makes the task title focusable from script only, below the sticky headers', () => {
    const html = renderToStaticMarkup(renderPanel({ ...openTask, title: 'Review all page content' }, { kind: 'complete_task' }).tree);

    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Review all page content<\/h2>/);
    // 3.5rem site header, plus the 3.5rem context header below md.
    expect(html).toMatch(/class="[^"]*scroll-mt-28 md:scroll-mt-14[^"]*"/);
  });
});
