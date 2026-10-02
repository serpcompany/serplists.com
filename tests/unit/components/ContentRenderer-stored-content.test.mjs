import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { findElement } from '../../support/elementTree';

describe('ContentRenderer given content as D1 stores it, which its declared types rule out', () => {
  it('renders malformed stored content without throwing', () => {
    const contents = [
      { type: 'text', value: {} },
      { type: 'embed', value: ['x'] },
      { type: 'subItems', value: '', subItems: 'x' },
      { type: 'subItems', value: '', subItems: [{ id: 'a', title: { en: 'x' } }, null] },
    ];

    expect(() => renderToStaticMarkup(createElement(ContentRenderer, { contents }))).not.toThrow();
  });

  it('reports a Sub-task toggle by the stored positions of its block and Sub-task, malformed blocks before it included, since saves address them by position', () => {
    const onSubItemToggle = vi.fn();
    const contents = [
      null,
      { type: 'text', value: {} },
      { id: 'steps', type: 'subItems', value: '', subItems: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }] },
    ];

    const rendered = ContentRenderer({ contents, onSubItemToggle });
    const second = findElement(rendered, (element) => element.props['aria-label'] === 'Second');
    second?.props.onCheckedChange();

    expect(onSubItemToggle).toHaveBeenCalledWith(2, 1, true);
  });
});
