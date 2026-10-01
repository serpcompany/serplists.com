import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { TaskHeaderReveal } from '@/components/run-execution/TaskHeaderReveal';
import type { PrimaryTaskAction } from '@/features/run-execution/primaryTaskAction';
import type { ChecklistItem } from '@/types/checklist';

import { findAllElements, type AnyElement } from '../../../support/elementTree';

const textOf = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return React.isValidElement(node) ? textOf((node as AnyElement).props.children) : '';
};

const KEYBOARD_ACTIVATION = 0;
const SINGLE_CLICK = 1;
const SECOND_CLICK_OF_A_DOUBLE_CLICK = 2;
const THIRD_CLICK = 3;

type ClickHandler = (event: { detail: number }) => void;

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
  const click = (label: string, detail = SINGLE_CLICK) => {
    const [button] = findAllElements(tree, (element) => typeof element.props.onClick === 'function' && textOf(element) === label);
    (button?.props.onClick as ClickHandler)({ detail });
  };
  const taskCheckbox = (detail = SINGLE_CLICK) => {
    const [button] = findAllElements(tree, (element) => element.type === 'button');
    (button?.props.onClick as ClickHandler)({ detail });
  };
  const subTaskHandler = () => {
    const [renderer] = findAllElements(tree, (element) => typeof element.props.onSubItemToggle === 'function');
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

describe('TaskExecutionPanel ignores the second click of a double click, which would land on the next task its buttons now show', () => {
  it('a double click on Next Task moves on without completing the next task', () => {
    const done = renderPanel({ ...openTask, isCompleted: true }, { kind: 'next_task' });
    done.click('Next Task', SINGLE_CLICK);
    expect(done.onNavigateNext).toHaveBeenCalledTimes(1);

    const nextTaskRenderedBeforeTheSecondClick = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    nextTaskRenderedBeforeTheSecondClick.click('Mark Complete', SECOND_CLICK_OF_A_DOUBLE_CLICK);
    expect(nextTaskRenderedBeforeTheSecondClick.onToggleTask).not.toHaveBeenCalled();
  });

  it('a repeat click on Mark Complete after a fast save does not complete the next task', () => {
    const next = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    next.click('Mark Complete', SECOND_CLICK_OF_A_DOUBLE_CLICK);
    next.click('Mark Complete', THIRD_CLICK);
    expect(next.onToggleTask).not.toHaveBeenCalled();
  });

  it('the task checkbox ignores the repeat click too', () => {
    const next = renderPanel({ ...openTask, id: 'task-2' }, { kind: 'complete_task' });
    next.taskCheckbox(SECOND_CLICK_OF_A_DOUBLE_CLICK);
    expect(next.onToggleTask).not.toHaveBeenCalled();
  });

  it('keyboard activation (detail 0) still acts', () => {
    const panel = renderPanel(openTask, { kind: 'complete_task' });
    panel.click('Mark Complete', KEYBOARD_ACTIVATION);
    panel.taskCheckbox(KEYBOARD_ACTIVATION);
    expect(panel.onToggleTask).toHaveBeenCalledTimes(2);

    const done = renderPanel({ ...openTask, isCompleted: true }, { kind: 'next_task' });
    done.click('Next Task', KEYBOARD_ACTIVATION);
    expect(done.onNavigateNext).toHaveBeenCalledTimes(1);
  });
});

describe('TaskExecutionPanel on a completed run', () => {
  it('locks the task and sub-task checkboxes, and keeps notes editable', () => {
    const { tree } = renderPanel(openTask, { kind: 'run_completed' }, { runCompleted: true });
    const [taskCheckbox] = findAllElements(tree, (element) => element.type === 'button');
    const [renderer] = findAllElements(tree, (element) => typeof element.props.onSubItemToggle === 'function');
    const [notes] = findAllElements(tree, (element) => element.props.label === 'Task notes');

    expect(taskCheckbox?.props.disabled).toBe(true);
    expect(renderer?.props.disabled).toBe(true);
    expect(notes?.props.readOnly).toBe(false);
  });

  it('leaves an in-progress run tickable', () => {
    const { tree } = renderPanel(openTask, { kind: 'complete_task' });
    const [taskCheckbox] = findAllElements(tree, (element) => element.type === 'button');

    expect(taskCheckbox?.props.disabled).toBe(false);
  });
});

describe('TaskExecutionPanel task checkbox, the only control that unticks a completed task, tells assistive technology its name and checked state', () => {
  const toggleOf = (tree: unknown) => findAllElements(tree, (element) => element.props.role === 'checkbox');
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

describe('TaskExecutionPanel reveals each task it moves to, since it stays mounted while the window scrolls and its task changes', () => {
  it('wraps the task header, with its title and checkbox, in a reveal keyed on the task id', () => {
    const { tree } = renderPanel({ ...openTask, id: 'task-7' }, { kind: 'complete_task' });
    const reveals = findAllElements(tree, (element) => element.type === TaskHeaderReveal);

    expect(reveals).toHaveLength(1);
    expect(reveals[0]?.props.taskId).toBe('task-7');
    expect(findAllElements(reveals[0], (element) => element.type === 'h2')).toHaveLength(1);
    expect(findAllElements(reveals[0], (element) => element.props.role === 'checkbox')).toHaveLength(1);
  });

  it("makes the task title focusable from script only, scrolled below the console's 3.5rem top bar at every width", () => {
    const html = renderToStaticMarkup(renderPanel({ ...openTask, title: 'Review all page content' }, { kind: 'complete_task' }).tree);

    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Review all page content<\/h2>/);
    expect(html).toMatch(/class="[^"]*scroll-mt-14[^"]*"/);
    expect(html).not.toContain('scroll-mt-28');
  });
});

describe("TaskExecutionPanel gives every task its own content blocks, so a video never keeps playing the previous task's file", () => {
  const video = { type: 'video' as const, value: 'https://cdn.example.com/a.mp4' };
  const renderTask = (id: string) => renderPanel({ ...openTask, id, contents: [video] }, { kind: 'complete_task' }).tree;
  const isRenderer = (node: unknown) => React.isValidElement(node) && node.type === ContentRenderer;

  it('keys the task content on the task id', () => {
    const renderers = findAllElements(renderTask('task-7'), isRenderer);

    expect(renderers).toHaveLength(1);
    expect(renderers[0]?.key).toContain('task-7');
    expect(findAllElements(renderTask('task-8'), isRenderer)[0]?.key).not.toBe(renderers[0]?.key);
  });

  it("gives the task content a key that no sibling, such as the task's notes, shares, so the previous task's blocks never stay beside the new ones", () => {
    const [parent] = findAllElements(renderTask('task-7'), (element) =>
      Array.isArray(element.props.children) && element.props.children.some(isRenderer));
    const keys = (parent?.props.children as unknown[])
      .filter((child): child is AnyElement => React.isValidElement(child))
      .flatMap((child) => (child.key === null ? [] : [child.key]));

    expect(keys.length).toBeGreaterThan(1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('TaskExecutionPanel keeps its footer pinned to the bottom of the window', () => {
  const panelClasses = () =>
    String((renderPanel(openTask, { kind: 'complete_task' }).tree as AnyElement).props.className).split(' ');

  it("is at least the window's height under the 3.5rem top bar, so the footer starts at the bottom of the window even on a short task", () => {
    expect(panelClasses()).toContain('min-h-[calc(100dvh-3.5rem)]');
  });

  it('clips its overflow instead of scrolling or hiding it, since a scroll container would hold the sticky footer to itself', () => {
    expect(panelClasses()).toContain('overflow-clip');
    expect(panelClasses().filter((name) => /^overflow-(auto|hidden|scroll)$/.test(name))).toEqual([]);
  });
});
