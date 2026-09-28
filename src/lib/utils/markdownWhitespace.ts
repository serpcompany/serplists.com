// Markdown blocks render with `white-space: pre-line` so that a single newline an author
// typed inside a paragraph shows as a line break. react-markdown also emits "\n" text
// nodes between block elements (paragraphs, list items, nested lists), and pre-line would
// show each of those as an extra blank line on top of the typography margins. This rehype
// step removes the newlines that sit next to block elements and keeps the ones inside
// inline content, which are the author's line breaks.

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

const BLOCK_TAGS = new Set([
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const isElement = (node: HastNode | undefined, tagNames: ReadonlySet<string>) =>
  node?.type === 'element' && tagNames.has(node.tagName ?? '');

const isBlock = (node: HastNode | undefined) => isElement(node, BLOCK_TAGS);
const LINE_BREAK = new Set(['br']);

const trimChildren = (parent: HastNode): void => {
  // Code blocks keep every character.
  if (parent.type === 'element' && parent.tagName === 'pre') return;
  const children = parent.children;
  if (!children) return;

  const kept: HastNode[] = [];
  children.forEach((child, index) => {
    const previous = children[index - 1];
    const next = children[index + 1];

    if (child.type !== 'text' || typeof child.value !== 'string') {
      trimChildren(child);
      kept.push(child);
      return;
    }

    let value = child.value;
    // A newline right after a block or a hard break (<br>) would start an empty line.
    if (isBlock(previous) || isElement(previous, LINE_BREAK)) value = value.replace(/^[^\S\n]*\n/, '');
    if (isBlock(next)) value = value.replace(/\n\s*$/, '');

    const betweenBlocks = (previous === undefined || isBlock(previous)) && (next === undefined || isBlock(next));
    if (value === '' || (betweenBlocks && /^\s*$/.test(value) && /\n/.test(child.value))) return;

    child.value = value;
    kept.push(child);
  });
  parent.children = kept;
};

/** Rehype plugin: drops the newline text between block elements. */
export function rehypeTrimBlockNewlines() {
  return (tree: HastNode) => {
    trimChildren(tree);
  };
}
