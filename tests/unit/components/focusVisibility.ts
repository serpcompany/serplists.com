import { capturedGroup } from '../../support/elements';

export type MarkupNode = {
  attrs: Record<string, string>;
  children: MarkupNode[];
  parent: MarkupNode | null;
  tag: string;
  text: string;
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

export function parseMarkup(html: string): MarkupNode {
  const root: MarkupNode = { attrs: {}, children: [], parent: null, tag: '#root', text: '' };
  const tokens = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let current = root;
  for (const match of html.matchAll(tokens)) {
    const [, closing, , , selfClosing, text] = match;
    if (text !== undefined) {
      current.children.push({ attrs: {}, children: [], parent: current, tag: '#text', text });
      continue;
    }
    if (closing) {
      current = current.parent ?? root;
      continue;
    }
    const tag = capturedGroup(match, 2);
    const attrs: Record<string, string> = {};
    for (const attr of capturedGroup(match, 3).matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      attrs[capturedGroup(attr, 1)] = attr[2] ?? '';
    }
    const node: MarkupNode = { attrs, children: [], parent: current, tag, text: '' };
    current.children.push(node);
    if (!selfClosing && !VOID_TAGS.has(tag)) current = node;
  }
  return root;
}

export function findAll(node: MarkupNode, matches: (node: MarkupNode) => boolean): MarkupNode[] {
  return node.children.flatMap((child) => [
    ...(matches(child) ? [child] : []),
    ...findAll(child, matches),
  ]);
}

export function selfAndAncestors(node: MarkupNode): MarkupNode[] {
  const chain: MarkupNode[] = [];
  for (let current: MarkupNode | null = node; current; current = current.parent) chain.push(current);
  return chain;
}

export function textOf(node: MarkupNode): string {
  return node.tag === '#text' ? node.text : node.children.map(textOf).join('');
}

const classTokens = (node: MarkupNode): string[] =>
  (node.attrs['class'] ?? '').split(/\s+/).filter(Boolean);

const isFocusable = (node: MarkupNode): boolean => {
  if (node.attrs['tabindex'] === '-1' || 'disabled' in node.attrs) return false;
  if (node.tag === 'a') return 'href' in node.attrs;
  return ['button', 'input', 'select', 'textarea'].includes(node.tag) || 'tabindex' in node.attrs;
};

const HIDDEN_UNTIL_HOVER = [
  { hidden: 'opacity-0', shown: /^(group-)?focus-(within|visible):opacity-100$/ },
  { hidden: 'translate-y-full', shown: /^(group-)?focus-(within|visible):translate-y-0$/ },
];

const whyHiddenWhileFocused = (node: MarkupNode): string | null => {
  for (const ancestor of selfAndAncestors(node)) {
    if (ancestor.attrs['aria-hidden'] === 'true') return 'inside aria-hidden';
    const tokens = classTokens(ancestor);
    for (const { hidden, shown } of HIDDEN_UNTIL_HOVER) {
      if (tokens.includes(hidden) && !tokens.some((token) => shown.test(token))) {
        return `inside ${hidden} with no focus variant`;
      }
    }
  }
  return null;
};

export function findHiddenFocusables(html: string): string[] {
  return findAll(parseMarkup(html), isFocusable).flatMap((node) => {
    const reason = whyHiddenWhileFocused(node);
    return reason ? [`<${node.tag}> "${textOf(node).trim()}" ${reason}`] : [];
  });
}
