import { readFileSync } from 'node:fs';
import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import postcss, { type AcceptedPlugin, type Rule } from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const globalsPath = path.join(repoRoot, 'src/app/globals.css');

const isPostcssPlugin = (value: unknown): value is AcceptedPlugin =>
  typeof value === 'object' && value !== null && 'postcssPlugin' in value;

const tailwindPostcssPlugin = (): AcceptedPlugin => {
  const plugin: unknown = tailwindcss({ base: repoRoot });
  if (!isPostcssPlugin(plugin)) throw new Error('@tailwindcss/postcss gave no PostCSS plugin');
  return plugin;
};

let css = '';
let rules: Array<{ rule: Rule; selector: string }> = [];

const selectorAfterTailwindNesting = (rule: Rule): string => {
  const parent = rule.parent;
  if (!parent || parent.type !== 'rule') return rule.selector;
  const parentSelector = selectorAfterTailwindNesting(parent as Rule);
  return rule.selector.includes('&')
    ? rule.selector.replace(/&/g, parentSelector)
    : `${parentSelector} ${rule.selector}`;
};

const buildGlobalsCssAsTheNextJsBuildDoes = () =>
  postcss([tailwindPostcssPlugin()]).process(readFileSync(globalsPath, 'utf8'), { from: globalsPath });

beforeAll(async () => {
  const result = await buildGlobalsCssAsTheNextJsBuildDoes();
  css = result.css;
  rules = [];
  result.root.walkRules((rule) => {
    rules.push({ rule, selector: selectorAfterTailwindNesting(rule) });
  });
}, 120_000);

const NOT_PROSE_SUFFIX_OF_EVERY_ELEMENT_SELECTOR = /:not\(:where\(\[class~="not-prose"\],\s*\[class~="not-prose"\] \*\)\)/g;

const winningDeclarationsFor = (selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {};
  for (const { rule, selector: ruleSelector } of rules) {
    if (ruleSelector.replace(NOT_PROSE_SUFFIX_OF_EVERY_ELEMENT_SELECTOR, '').replace(/\s+/g, ' ') !== selector) continue;
    for (const node of rule.nodes) {
      if (node.type === 'decl') declarations[node.prop] = node.value;
    }
  }
  return declarations;
};

describe('Tailwind typography for markdown blocks, without which Preflight strips their list markers, heading sizes and link underlines', () => {
  it('generates the prose classes used in src', () => {
    expect(rules.some(({ selector }) => selector === '.prose')).toBe(true);
    expect(rules.some(({ selector }) => selector === '.prose-sm')).toBe(true);
  });

  it('restores list markers and link underlines that Preflight removes', () => {
    expect(winningDeclarationsFor('.prose :where(ul)')['list-style-type']).toBe('disc');
    expect(winningDeclarationsFor('.prose :where(ol)')['list-style-type']).toBe('decimal');
    expect(winningDeclarationsFor('.prose :where(ul)')['padding-inline-start']).toMatch(/em$/);
    expect(winningDeclarationsFor('.prose :where(a)')['text-decoration']).toBe('underline');
    expect(winningDeclarationsFor('.prose :where(h1)')['font-size']).toMatch(/em$/);
  });

  it('draws prose colors from the theme tokens so dark mode follows the app', () => {
    const prose = winningDeclarationsFor('.prose');
    expect(prose['--tw-prose-body']).toBe('var(--foreground)');
    expect(prose['--tw-prose-headings']).toBe('var(--foreground)');
    expect(prose['--tw-prose-links']).toBe('var(--primary)');
    expect(prose['--tw-prose-bullets']).toBe('var(--muted-foreground)');
    expect(prose['--tw-prose-pre-bg']).toBe('var(--muted)');
  });

  it('does not wrap inline code in literal backticks', () => {
    expect(winningDeclarationsFor('.prose :where(code)::before').content).toBe('none');
    expect(winningDeclarationsFor('.prose :where(code)::after').content).toBe('none');
  });

  it('shows task list checkboxes without bullets', () => {
    const taskList = winningDeclarationsFor('.prose :where(ul.contains-task-list)');
    expect(taskList['list-style-type']).toBe('none');
    expect(taskList['padding-inline-start']).toBe('0');
    expect(css).toContain('contains-task-list');
  });
});
