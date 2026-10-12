import { describe, expect, it } from 'vitest';

import { anchorOf, headingAnchors, headingSlug } from '../../../../scripts/checks/doc-rules/anchors';
import { budgetProblem, staleAllowances, wrappedLines } from '../../../../scripts/checks/doc-rules/budgets';
import { misnamed, misnamedDecision, outOfLayout } from '../../../../scripts/checks/doc-rules/layout';
import { markdownLinks, proseLines } from '../../../../scripts/checks/doc-rules/markdown';
import { namedPath, repositoryTree } from '../../../../scripts/checks/doc-rules/paths';
import { missingScript, pnpmScripts, proseScripts } from '../../../../scripts/checks/doc-rules/scripts';
import { skillProblems } from '../../../../scripts/checks/doc-rules/skills';

describe('heading anchors', () => {
  it('slug headings the way GitHub does', () => {
    expect(headingSlug('Code review')).toBe('code-review');
    expect(headingSlug('`pnpm run verify` and [the hook](x.md)')).toBe('pnpm-run-verify-and-the-hook');
    expect(headingSlug('What changes, and why?')).toBe('what-changes-and-why');
    expect(headingSlug('The <kbd>Return</kbd> key')).toBe('the-return-key');
  });

  it('number a repeated heading, skip headings in fenced code, and keep HTML anchors', () => {
    const prose = proseLines('# Checks\n## Run\n## Run\n```md\n## Not a heading\n```\n<a id="Kept"></a>');
    expect([...headingAnchors(prose)]).toEqual(['checks', 'run', 'run-1', 'kept']);
  });

  it('read the anchor from a link, decoded and in lower case', () => {
    expect(anchorOf('ci-agents.md#Code-Review')).toBe('code-review');
    expect(anchorOf('ci.md')).toBeNull();
  });
});

describe('links', () => {
  it('find inline and reference links, but none in code', () => {
    const prose = proseLines(
      [
        'See [the guide](docs/guide.md#run) and [a site](https://example.com "Example").',
        '[ref]: ../other.md',
        'Not `[this](inline.md)`.',
        '```',
        '[nor this](fenced.md)',
        '```',
      ].join('\n'),
    );
    expect(markdownLinks(prose)).toEqual([
      { line: 1, target: 'docs/guide.md#run' },
      { line: 1, target: 'https://example.com' },
      { line: 2, target: '../other.md' },
    ]);
  });

  it('keep the parentheses of a Next.js route group in a link target', () => {
    expect(markdownLinks(proseLines('[layout](../../src/app/(app)/layout.tsx) and [x](<a b.md>)'))).toEqual([
      { line: 1, target: '../../src/app/(app)/layout.tsx' },
      { line: 1, target: 'a b.md' },
    ]);
  });
});

describe('repository paths in code spans', () => {
  const tree = repositoryTree(['src/app/(app)/page.tsx', 'tools/checks/hook.mjs', 'package.json', 'docs/agents/code.md']);

  it('read a span under a tracked top-level folder, or a tracked root file, as a path', () => {
    expect(namedPath('src/app/(app)/page.tsx:12-20', tree)).toBe('src/app/(app)/page.tsx');
    expect(namedPath('./tools/checks/', tree)).toBe('tools/checks');
    expect(namedPath('package.json', tree)).toBe('package.json');
    expect(namedPath('src/gone.ts', tree)).toBe('src/gone.ts');
  });

  it('leave out patterns, placeholders, commands and paths outside the tracked folders', () => {
    expect(['src/**/*.ts', 'src/<area>/', 'pnpm run verify', 'tmp/agent/verify/', '.dev.vars', 'next/link', 'node.js'].map((code) => namedPath(code, tree))).toEqual(
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
    );
  });
});

describe('pnpm script names', () => {
  const known = { scripts: new Set(['verify', 'check', 'dev:all', 'setup']), binaries: new Set(['wrangler']) };
  const missing = (code: string) => pnpmScripts(code).filter((script) => missingScript(script, known));

  it("pass scripts package.json defines, pnpm's own commands and installed binaries", () => {
    expect(missing('pnpm run verify comments scripts/checks')).toEqual([]);
    expect(missing('pnpm install && pnpm run setup && pnpm dev:all')).toEqual([]);
    expect(missing('pnpm exec tsc -p tsconfig.node.json --noEmit; pnpm dlx knip')).toEqual([]);
    expect(missing('pnpm --silent check')).toEqual([]);
    expect(missing('pnpm wrangler types')).toEqual([]);
  });

  it('name a script package.json lacks, in both forms', () => {
    expect(missing('pnpm deploy:preview')).toEqual(['deploy:preview']);
    expect(missing('pnpm run lint:all')).toEqual(['lint:all']);
  });

  it('skip placeholders, and read only the pnpm run form in prose', () => {
    expect(missing('pnpm <script>')).toEqual([]);
    expect(proseScripts('Run pnpm run docs:gone. Then pnpm passes the flag on.')).toEqual(['docs:gone']);
  });
});

describe('layout and names', () => {
  it.each([
    ['CONTEXT.md', false],
    ['CLAUDE.md', false],
    ['docs/agents/code.md', false],
    ['docs/harness-debt.md', false],
    ['docs/references/vitest-llms.txt', false],
    ['src/components/README.md', false],
    ['NOTES.md', true],
    ['docs/exec-plans/plans.md', true],
    ['docs/PLANS.md', true],
  ])('%s is out of the layout: %s', (path, expected) => {
    expect(outOfLayout(path)).toBe(expected);
  });

  it.each([
    ['docs/agents/code.md', false],
    ['docs/product/portable-templates/examples/full/README.md', false],
    ['docs/agents/CLAUDE.md', false],
    ['docs/api/portable-template-pack.schema.json', false],
    ['docs/references/xml-sitemap-standards.md', false],
    ['docs/agents/Code_Rules.md', true],
    ['docs/Agents/code.md', true],
    ['docs/product/WordDetail.md', true],
  ])('%s is misnamed: %s', (path, expected) => {
    expect(misnamed(path)).toBe(expected);
  });

  it('name decision records NNNN-<kebab>.md', () => {
    expect(misnamedDecision('docs/adr/0001-use-personal-and-organization-ownership-contexts.md')).toBe(false);
    expect(misnamedDecision('docs/adr/personal-contexts.md')).toBe(true);
    expect(misnamedDecision('docs/adr/0002_Staging.md')).toBe(true);
  });
});

describe('skills', () => {
  const path = '.claude/skills/verify-web/SKILL.md';
  const skill = (fields: string) => `---\n${fields}\n---\n\n# Verify\n`;

  it('pass a skill named for its folder, described, and in the catalog', () => {
    expect(skillProblems(path, skill('name: verify-web\ndescription: Check a page.'), [path])).toEqual([]);
  });

  it('name each problem', () => {
    expect(skillProblems(path, skill(`name: verify\ndescription: ${'x'.repeat(1025)}`), [])).toEqual([
      "is named verify, not verify-web, its folder's name",
      'has a description of 1025 characters, over the Agent Skills limit of 1024',
      "isn't listed in docs/agents/code.md's Skills table",
    ]);
    expect(skillProblems(path, skill('name: verify-web\ndescription: ""'), [path])).toEqual([
      'has no description, which is how an agent knows when to use it',
    ]);
    expect(skillProblems(path, '# No frontmatter\n', [path])).toEqual([
      'has no YAML frontmatter between --- lines, which Claude Code reads the skill from',
    ]);
  });
});

describe('doc size budgets', () => {
  const lines = (count: number) => 'line\n'.repeat(count);

  it('count a long line for its wrapped length, an empty line as one, and no trailing newline', () => {
    expect(wrappedLines('short\n')).toBe(1);
    expect(wrappedLines(`${'a'.repeat(250)}\nshort\n`)).toBe(4);
    expect(wrappedLines('one\n\n')).toBe(2);
  });

  it('give a map 120 lines and any other doc 300', () => {
    expect(budgetProblem('AGENTS.md', lines(120), {})).toBeUndefined();
    expect(budgetProblem('docs/agents/CLAUDE.md', lines(121), {})).toMatch(/a map gets 120/);
    expect(budgetProblem('README.md', lines(121), {})).toMatch(/a map gets 120/);
    expect(budgetProblem('docs/product/portable-templates/examples/full/README.md', lines(250), {})).toBeUndefined();
    expect(budgetProblem('docs/agents/frontend.md', lines(301), {})).toMatch(/a doc gets 300/);
  });

  it('leave generated references, vendored docs and decision records out', () => {
    expect(['docs/api/db-schema.md', 'docs/references/x.md', 'docs/adr/0001-x.md'].map((doc) => budgetProblem(doc, lines(2000), {}))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('let an allowed doc shrink but not grow, and ask for its entry to be lowered or removed', () => {
    const known = { 'docs/agents/frontend.md': 800 };
    expect(budgetProblem('docs/agents/frontend.md', lines(800), known)).toBeUndefined();
    expect(budgetProblem('docs/agents/frontend.md', lines(801), known)).toMatch(/grew to 801 lines, over its allowance of 800/);
    expect(budgetProblem('docs/agents/frontend.md', lines(700), known)).toMatch(/lower its entry in knownLongDocs to 700/);
    expect(budgetProblem('docs/agents/frontend.md', lines(300), known)).toMatch(/remove it from knownLongDocs/);
  });

  it('refuse an allowance without a size', () => {
    expect(budgetProblem('docs/agents/frontend.md', lines(800), { 'docs/agents/frontend.md': 0 })).toMatch(/with no size/);
    expect(budgetProblem('docs/agents/frontend.md', lines(800), { 'docs/agents/frontend.md': Number.NaN })).toMatch(/with no size/);
  });

  it('name an allowance whose doc is gone', () => {
    expect(staleAllowances((doc) => doc === 'kept.md', { 'kept.md': 400, 'gone.md': 400 })).toEqual(['gone.md']);
  });
});
