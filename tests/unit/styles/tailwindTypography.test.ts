import postcss, { type Rule } from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

// Markdown text blocks are wrapped in `prose prose-sm`. Without @tailwindcss/typography those
// classes produce no CSS, so Preflight strips list bullets and numbers, heading sizes and
// link underlines from every rendered task description.

let css = '';
let rules: Rule[] = [];

beforeAll(async () => {
  const result = await postcss([tailwindcss(config)]).process(
    '@tailwind components;\n@tailwind utilities;',
    { from: undefined },
  );
  css = result.css;
  rules = [];
  result.root.walkRules((rule) => {
    rules.push(rule);
  });
}, 60_000);

// The plugin appends `:not(:where([class~="not-prose"], ...))` to every element selector.
const NOT_PROSE = /:not\(:where\(\[class~="not-prose"\],\[class~="not-prose"\] \*\)\)/g;

const declarationsFor = (selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {};
  for (const rule of rules) {
    if (rule.selector.replace(NOT_PROSE, '') !== selector) continue;
    rule.walkDecls((decl) => {
      declarations[decl.prop] = decl.value;
    });
  }
  return declarations;
};

describe('Tailwind typography for markdown blocks', () => {
  it('generates the prose classes used in src', () => {
    expect(rules.some((rule) => rule.selector === '.prose')).toBe(true);
    expect(rules.some((rule) => rule.selector === '.prose-sm')).toBe(true);
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
