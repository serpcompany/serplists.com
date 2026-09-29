import { readFileSync } from 'node:fs';
import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import postcss, { type Rule } from 'postcss';
import { beforeAll, describe, expect, it } from 'vitest';

// Markdown text blocks are wrapped in `prose prose-sm`. Without @tailwindcss/typography those
// classes produce no CSS, so Preflight strips list bullets and numbers, heading sizes and
// link underlines from every rendered task description. This builds the app's stylesheet
// (src/app/globals.css) the way the Next.js build does.

const repoRoot = path.resolve(__dirname, '../../..');
const globalsPath = path.join(repoRoot, 'src/app/globals.css');

let css = '';
let rules: Array<{ rule: Rule; selector: string }> = [];

// Tailwind v4 nests the plugin's element rules inside `.prose { ... }`: resolve each rule to
// the selector it matches.
const fullSelector = (rule: Rule): string => {
  const parent = rule.parent;
  if (!parent || parent.type !== 'rule') return rule.selector;
  const parentSelector = fullSelector(parent as Rule);
  return rule.selector.includes('&')
    ? rule.selector.replace(/&/g, parentSelector)
    : `${parentSelector} ${rule.selector}`;
};

beforeAll(async () => {
  const result = await postcss([tailwindcss({ base: repoRoot })]).process(
    readFileSync(globalsPath, 'utf8'),
    { from: globalsPath },
  );
  css = result.css;
  rules = [];
  result.root.walkRules((rule) => {
    rules.push({ rule, selector: fullSelector(rule) });
  });
}, 120_000);

// The plugin appends `:not(:where([class~="not-prose"], ...))` to every element selector.
const NOT_PROSE = /:not\(:where\(\[class~="not-prose"\],\s*\[class~="not-prose"\] \*\)\)/g;

// Declarations in stylesheet order, so a later rule for the same selector wins, as it does in
// the browser for the unlayered overrides in globals.css.
const declarationsFor = (selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {};
  for (const { rule, selector: ruleSelector } of rules) {
    if (ruleSelector.replace(NOT_PROSE, '').replace(/\s+/g, ' ') !== selector) continue;
    for (const node of rule.nodes) {
      if (node.type === 'decl') declarations[node.prop] = node.value;
    }
  }
  return declarations;
};

describe('Tailwind typography for markdown blocks', () => {
  it('generates the prose classes used in src', () => {
    expect(rules.some(({ selector }) => selector === '.prose')).toBe(true);
    expect(rules.some(({ selector }) => selector === '.prose-sm')).toBe(true);
  });

  it('restores list markers and link underlines that Preflight removes', () => {
    expect(declarationsFor('.prose :where(ul)')['list-style-type']).toBe('disc');
    expect(declarationsFor('.prose :where(ol)')['list-style-type']).toBe('decimal');
    expect(declarationsFor('.prose :where(ul)')['padding-inline-start']).toMatch(/em$/);
    expect(declarationsFor('.prose :where(a)')['text-decoration']).toBe('underline');
    expect(declarationsFor('.prose :where(h1)')['font-size']).toMatch(/em$/);
  });

  it('draws prose colors from the theme tokens so dark mode follows the app', () => {
    const prose = declarationsFor('.prose');
    expect(prose['--tw-prose-body']).toBe('var(--foreground)');
    expect(prose['--tw-prose-headings']).toBe('var(--foreground)');
    expect(prose['--tw-prose-links']).toBe('var(--primary)');
    expect(prose['--tw-prose-bullets']).toBe('var(--muted-foreground)');
    expect(prose['--tw-prose-pre-bg']).toBe('var(--muted)');
  });

  it('does not wrap inline code in literal backticks', () => {
    expect(declarationsFor('.prose :where(code)::before').content).toBe('none');
    expect(declarationsFor('.prose :where(code)::after').content).toBe('none');
  });

  it('shows task list checkboxes without bullets', () => {
    const taskList = declarationsFor('.prose :where(ul.contains-task-list)');
    expect(taskList['list-style-type']).toBe('none');
    expect(taskList['padding-inline-start']).toBe('0');
    expect(css).toContain('contains-task-list');
  });
});
