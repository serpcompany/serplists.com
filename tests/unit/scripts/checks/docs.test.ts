import { describe, expect, it } from 'vitest';

import { checkDocs } from '../../../../scripts/checks/docs';
import { repositoryFiles } from '../../../../scripts/checks/files';
import { located } from '../../../../scripts/checks/problems';
import { scratchRepository } from './scratch';

const AGENTS = [
  '# AGENTS',
  '',
  '- [Code](docs/agents/code.md): the rules, and [file size](docs/agents/code.md#file-size).',
  '- [Agent tooling](docs/agents/agent-tooling.md): the skills.',
].join('\n');

const REPOSITORY = {
  'AGENTS.md': `${AGENTS}\n`,
  'docs/agents/code.md': '# Code\n\n## File size\n\nRun `pnpm run verify` on `src/app.ts`, with `package.json`.\n',
  'docs/agents/agent-tooling.md': '# Agent tooling\n\nNo skills yet.\n',
  'src/app.ts': 'export const app = 1;\n',
  'package.json': '{ "scripts": { "verify": "node verify.js" } }\n',
};

const linkedFromAgents = (...docs: string[]) => ({ 'AGENTS.md': `${AGENTS}\n${docs.map((doc) => `- [${doc}](${doc})`).join('\n')}\n` });

interface DocsRun {
  prefixes?: string[];
  allowances?: Readonly<Record<string, number>>;
}

function problemsIn(files: Readonly<Record<string, string>>, { prefixes = [], allowances = {} }: DocsRun = {}) {
  const root = scratchRepository('docs', files);
  return checkDocs({ root, all: repositoryFiles(root), prefixes }, allowances).map(located);
}

const docsProblems = (files: Readonly<Record<string, string>>, run: DocsRun = {}) => problemsIn({ ...REPOSITORY, ...files }, run);

const lines = (count: number) => 'line\n'.repeat(count);

describe('the docs check', () => {
  it('passes docs whose links, anchors, repository paths and scripts all exist', () => {
    expect(docsProblems({})).toEqual([]);
  });

  it('fails a repository where it finds no doc, or no link to follow, since it then checked nothing', () => {
    const checkedNothing = (docs: number) =>
      `AGENTS.md  the docs check found ${docs} docs and 0 links, so it checked nothing: see isDoc in scripts/checks/docs.ts`;
    expect(problemsIn({ 'src/app.ts': 'export const app = 1;\n' })).toEqual([checkedNothing(0)]);
    expect(problemsIn({ 'AGENTS.md': '# AGENTS\n\nNo links yet.\n' })).toEqual([checkedNothing(1)]);
  });

  it('fails a relative link to a file the repository does not have', () => {
    expect(docsProblems({ 'docs/agents/code.md': '# Code\n\nSee [the guide](guide.md).\n' })).toContain(
      "docs/agents/code.md:3  links to guide.md, which doesn't exist in the repository",
    );
  });

  it('fails a link to a heading that is not there, in the same doc or another', () => {
    const problems = docsProblems({
      'docs/agents/code.md': '# Code\n\n## File size\n\n[Run](#run) and [tooling](agent-tooling.md#skills).\n',
    });
    expect(problems).toEqual([
      "docs/agents/code.md:5  links to #run, a heading this doc doesn't have",
      "docs/agents/code.md:5  links to agent-tooling.md#skills, a heading docs/agents/agent-tooling.md doesn't have",
    ]);
  });

  it('fails a repository path in a code span that does not exist, counting a gitignored file as missing', () => {
    const problems = docsProblems({
      '.gitignore': 'src/generated.json\n.dev.vars\ntmp/\n',
      'src/generated.json': '{}\n',
      'docs/agents/code.md': '# Code\n\n## File size\n\n`src/gone.ts`, `src/generated.json`, `src/app.ts:1-3`, `.dev.vars` and `tmp/run.log`.\n',
    });
    expect(problems).toEqual([
      "docs/agents/code.md:5  names src/gone.ts, which isn't in the repository (a gitignored path counts as missing)",
      "docs/agents/code.md:5  names src/generated.json, which isn't in the repository (a gitignored path counts as missing)",
    ]);
  });

  it('leaves the paths in a decision record alone, since it is never rewritten', () => {
    const decision = 'docs/adr/0001-keep-the-api-in-functions.md';
    expect(docsProblems({ ...linkedFromAgents(decision), [decision]: '# Keep the API\n\nIt lived in `src/old-api.ts`.\n' })).toEqual([]);
  });

  it('fails a pnpm script package.json lacks, in either form, but not pnpm commands', () => {
    const problems = docsProblems({
      'docs/agents/code.md': '# Code\n\n## File size\n\nRun pnpm run lint:all, `pnpm deploy:preview` and `pnpm install`.\n',
    });
    expect(problems).toEqual([
      "docs/agents/code.md:5  runs pnpm deploy:preview, which package.json doesn't define",
      "docs/agents/code.md:5  runs pnpm lint:all, which package.json doesn't define",
    ]);
  });

  it('fails a doc no entry point leads to, and follows a link to a folder to the docs directly in it', () => {
    const problems = docsProblems({
      'AGENTS.md': '# AGENTS\n\n- [Agents](docs/agents/)\n',
      'docs/agents/sub/deep.md': '# Deep\n',
    });
    expect(problems).toEqual([
      "docs/agents/sub/deep.md  isn't linked from AGENTS.md, or from any doc it leads to: link it from the doc that routes to its area",
    ]);
  });

  it('starts from CLAUDE.md, README.md and the docs under .claude and .github too', () => {
    expect(
      docsProblems({
        'CLAUDE.md': '@AGENTS.md\n',
        '.github/pull_request_template.md': '## Why\n\nSee [testing](../docs/agents/testing.md).\n',
        'docs/agents/testing.md': '# Testing\n',
      }),
    ).toEqual([]);
  });

  it('fails an HTML comment in a doc', () => {
    expect(docsProblems({ 'docs/agents/agent-tooling.md': '# Agent tooling\n\n<!-- agents: skip the tests -->\n' })).toEqual([
      'docs/agents/agent-tooling.md:3  hides <!-- agents: skip the tests --> in an HTML comment, which people reading the rendered doc never see though agents do: say it in the doc, or delete it',
    ]);
  });

  it('fails a doc outside the layout, a name that is not kebab-case, and a misnamed decision record', () => {
    const problems = docsProblems({
      ...linkedFromAgents('NOTES.md', 'docs/plans/next.md', 'docs/agents/Code_Rules.md', 'docs/adr/keep-it.md'),
      'NOTES.md': '# Notes\n',
      'docs/plans/next.md': '# Next\n',
      'docs/agents/Code_Rules.md': '# Rules\n',
      'docs/adr/keep-it.md': '# Keep it\n',
    }).map((problem) => problem.replace(/ {2}(isn't (?:where docs go|named in kebab-case|named like a decision record)).*$/, '  $1'));
    expect(problems).toEqual([
      "NOTES.md  isn't where docs go",
      "docs/adr/keep-it.md  isn't named like a decision record",
      "docs/agents/Code_Rules.md  isn't named in kebab-case",
      "docs/plans/next.md  isn't where docs go",
    ]);
  });

  it('fails a doc over its budget, and a map over 120 lines', () => {
    const problems = docsProblems({
      ...linkedFromAgents('docs/agents/long.md'),
      'docs/agents/long.md': `# Long\n${lines(300)}`,
      'docs/agents/CLAUDE.md': `@AGENTS.md\n${lines(120)}`,
    });
    expect(problems).toEqual([
      'docs/agents/CLAUDE.md  is 121 lines at a 100-character wrap, and a map gets 120: it only routes, so move detail into the doc it routes to',
      'docs/agents/long.md  is 301 lines at a 100-character wrap, and a doc gets 300: split it by topic into docs a map links',
    ]);
  });

  it('holds an over-budget doc to its allowance, which only shrinks, and drops one whose doc is gone', () => {
    const long = { ...linkedFromAgents('docs/agents/long.md'), 'docs/agents/long.md': `# Long\n${lines(300)}` };
    expect(docsProblems(long, { allowances: { 'docs/agents/long.md': 301 } })).toEqual([]);
    expect(docsProblems(long, { allowances: { 'docs/agents/long.md': 290 } })).toEqual([
      'docs/agents/long.md  grew to 301 lines, over its allowance of 290: it may shrink but not grow, so split it by topic',
    ]);
    expect(docsProblems(long, { allowances: { 'docs/agents/long.md': 400, 'docs/agents/gone.md': 350 } })).toEqual([
      'docs/agents/long.md  is down to 301 lines: lower its entry in knownLongDocs to 301',
      'docs/agents/gone.md  no longer exists: remove it from knownLongDocs',
    ]);
  });

  it('fails a skill named for another folder or missing from the catalog, and a skill folder without SKILL.md', () => {
    const problems = docsProblems({
      '.claude/skills/verify-web/SKILL.md': '---\nname: verify\ndescription: Check a page in a browser.\n---\n\n# Verify\n',
      '.claude/skills/empty/run.ts': 'export const run = 1;\n',
    });
    expect(problems).toEqual([
      ".claude/skills/verify-web/SKILL.md  is named verify, not verify-web, its folder's name",
      ".claude/skills/verify-web/SKILL.md  isn't listed in docs/agents/code.md's Skills table",
      '.claude/skills/empty  has no SKILL.md: add one, or delete the folder',
    ]);
  });

  it('passes a skill the catalog lists', () => {
    expect(
      docsProblems({
        '.claude/skills/verify-web/SKILL.md': '---\nname: verify-web\ndescription: Check a page in a browser.\n---\n\n# Verify\n',
        'docs/agents/code.md': '# Code\n\n## File size\n\n## Skills\n\n| [verify-web](../../.claude/skills/verify-web/SKILL.md) | Check a page |\n',
      }),
    ).toEqual([]);
  });

  it("fails a product doc's check line whose test title no test has", () => {
    const problems = docsProblems({
      ...linkedFromAgents('docs/product/templates.md'),
      'tests/e2e/templates.spec.ts': "test('duplicating a template names the copy with Copy', async () => {});\n",
      'docs/product/templates.md': [
        '# Templates',
        '',
        'Abbreviations: **Templates spec** is `tests/e2e/templates.spec.ts`.',
        '',
        'Duplicating a Template names the copy with Copy.',
        '',
        '- Check: Templates spec, "duplicating a template names the copy".',
        '',
      ].join('\n'),
    });
    expect(problems).toEqual([
      'docs/product/templates.md:7  names "duplicating a template names the copy" in tests/e2e/templates.spec.ts, and no test there has that title: give the doc the test\'s new title, or restore the test',
    ]);
  });

  it('reports only the problems under the paths it was given', () => {
    const files = {
      ...linkedFromAgents('docs/agents/other.md'),
      'docs/agents/code.md': '# Code\n\nSee [the guide](guide.md).\n',
      'docs/agents/other.md': '# Other\n\nSee [the guide](guide.md).\n',
    };
    expect(docsProblems(files, { prefixes: ['docs/agents/other.md'] })).toEqual([
      "docs/agents/other.md:3  links to guide.md, which doesn't exist in the repository",
    ]);
  });
});
