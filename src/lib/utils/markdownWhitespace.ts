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

const breaksLine = (node: HastNode | undefined) => isBlock(node) || isElement(node, LINE_BREAK);

const isCodeBlock = (node: HastNode) => node.type === 'element' && node.tagName === 'pre';

const trimChildren = (parent: HastNode): void => {
  if (isCodeBlock(parent)) return;
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
    if (breaksLine(previous)) value = value.replace(/^[^\S\n]*\n/, '');
    if (isBlock(next)) value = value.replace(/\n\s*$/, '');

    const betweenBlocks = (previous === undefined || isBlock(previous)) && (next === undefined || isBlock(next));
    if (value === '' || (betweenBlocks && /^\s*$/.test(value) && /\n/.test(child.value))) return;

    child.value = value;
    kept.push(child);
  });
  parent.children = kept;
};

export function rehypeTrimBlockNewlines() {
  return (tree: HastNode) => {
    trimChildren(tree);
  };
}
