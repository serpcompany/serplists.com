import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ContentRenderer } from '../../../src/components/shared/ContentRenderer';

const render = (contents) => renderToStaticMarkup(createElement(ContentRenderer, { contents }));

describe('ContentRenderer given content no parser read first, which its declared types rule out', () => {
  it('shows nothing for a block that is not an object or whose text is not text', () => {
    const markup = render([null, 'Pack the bag', { type: 'text', value: 42 }, { type: 'embed', value: { src: 'https://example.com' } }]);

    expect(markup).toBe(`<div class="space-y-6">${'<div class="space-y-3"></div>'.repeat(4)}</div>`);
  });

  it('names the Sub-tasks it cannot read by their place, unticked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const markup = render([{ type: 'subItems', value: '', subItems: [null, { id: 7, title: 8, isCompleted: 'yes' }, { id: 'kept', title: 'Lock up' }] }]);

    expect(markup).toContain('aria-label="Sub-task 1"');
    expect(markup).toContain('aria-label="Sub-task 2"');
    expect(markup).toContain('aria-label="Lock up"');
    expect(markup).toContain('<span class="line-through text-muted-foreground">Sub-task 2</span>');
    vi.mocked(console.error).mockRestore();
  });
});
