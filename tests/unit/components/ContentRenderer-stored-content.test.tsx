import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { normalizeSections } from '@/lib/utils/checklistSections';
import { contentAt, firstOf, subTaskAt, taskIn } from '../../support/elements';
import { findElement, handlerOf } from '../../support/elementTree';

const storedTaskWith = (contents: unknown): unknown => [
  { id: 'section-1', title: 'Launch', items: [{ id: 'task-1', title: 'Ship', contents }] },
];

const taskAsTheAppReadsIt = (stored: unknown) => taskIn(normalizeSections(stored), 0, 0);

describe('ContentRenderer given content as D1 stores it, which its declared types rule out', () => {
  it('renders malformed stored content without throwing', () => {
    const { contents = [] } = taskAsTheAppReadsIt(storedTaskWith([
      { type: 'text', value: {} },
      { type: 'embed', value: ['x'] },
      { type: 'subItems', value: '', subItems: 'x' },
      { type: 'subItems', value: '', subItems: [{ id: 'a', title: { en: 'x' } }, null] },
    ]));

    expect(() => renderToStaticMarkup(createElement(ContentRenderer, { contents }))).not.toThrow();
  });

  it('reports a Sub-task toggle by the stored positions of its block and Sub-task, malformed blocks before it included, since saves address them by position', () => {
    const onSubItemToggle = vi.fn<(contentIndex: number, subItemIndex: number, isCompleted: boolean) => void>();
    const task = taskAsTheAppReadsIt(storedTaskWith([
      null,
      { type: 'text', value: {} },
      { id: 'steps', type: 'subItems', value: '', subItems: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }] },
    ]));

    const rendered = ContentRenderer({ contents: task.contents ?? [], onSubItemToggle });
    handlerOf(findElement(rendered, (element) => element.props['aria-label'] === 'Second'), 'onCheckedChange')();

    const [contentIndex, subItemIndex, isCompleted] = firstOf(onSubItemToggle.mock.calls);
    expect(isCompleted).toBe(true);
    expect(contentAt(task, contentIndex).id).toBe('steps');
    expect(subTaskAt(contentAt(task, contentIndex), subItemIndex).id).toBe('second');
  });
});
