import { describe, expect, it } from 'vitest';

import { rehypeTrimBlockNewlines } from '@/lib/utils/markdownWhitespace';

const textAfter = (element: { type: string; tagName?: string }) => {
  const tree = { type: 'root', children: [{ ...element, children: [] }, { type: 'text', value: '\nnext line' }] };
  rehypeTrimBlockNewlines()(tree);
  return tree.children.map((child) => ('value' in child ? child.value : child.type));
};

describe('rehypeTrimBlockNewlines', () => {
  it('drops the line break after a block, which pre-line would show as a blank line', () => {
    expect(textAfter({ type: 'element', tagName: 'p' })).toEqual(['element', 'next line']);
  });

  it('keeps a space between two blocks that holds no line break, and drops one that does', () => {
    const paragraph = () => ({ type: 'element', tagName: 'p', children: [] });
    const tree = {
      type: 'root',
      children: [paragraph(), { type: 'text', value: ' ' }, paragraph(), { type: 'text', value: '\n' }, paragraph()],
    };

    rehypeTrimBlockNewlines()(tree);

    expect(tree.children.map((child) => ('value' in child ? child.value : child.tagName))).toEqual(['p', ' ', 'p', 'p']);
  });
});
