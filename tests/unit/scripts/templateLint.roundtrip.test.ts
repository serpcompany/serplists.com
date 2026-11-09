import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';
import { objectContaining, stringContaining } from '../../support/asymmetricMatchers';

const { readFileMock, markdownParserBrokenByTheTest } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  markdownParserBrokenByTheTest: { current: null as null | ((markdown: string) => unknown) },
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('@/lib/templates/templateMarkdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/templates/templateMarkdown')>();
  return {
    ...actual,
    parseTemplateMarkdown: (markdown: string) =>
      markdownParserBrokenByTheTest.current ? markdownParserBrokenByTheTest.current(markdown) : actual.parseTemplateMarkdown(markdown),
  };
});

const yamlWithMarkdownText = [
  'title: Setup Guide',
  'sections:',
  '  - title: Install',
  '    items:',
  '      - title: Run the installer',
  '        contents:',
  '          - type: text',
  '            value: |-',
  '              ### Tips',
  '              Run:',
  '              ```bash',
  '              npm i',
  '              ```',
].join('\n');

describe('templateLint Markdown round-trip', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    markdownParserBrokenByTheTest.current = null;
  });

  it('accepts a template whose text block holds a heading and a code fence', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);

    expect(await lintYamlTemplateBundle('/repo/template.yaml', {})).toEqual([]);
  });

  it('reports a template whose generated Markdown would not import back', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);
    markdownParserBrokenByTheTest.current = () => {
      throw new Error('Content block "text" is missing a closing fence');
    };

    const issues = await lintYamlTemplateBundle('/repo/template.yaml', {});

    expect(issues).toEqual([
      objectContaining({
        code: 'markdown-roundtrip',
        message: stringContaining('missing a closing fence'),
      }),
    ]);
  });

  it('reports generated Markdown that imports as a different template', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);
    markdownParserBrokenByTheTest.current = () => ({
      title: 'Setup Guide',
      sections: [{ title: 'Install', items: [{ title: 'Run the installer' }] }],
    });

    const issues = await lintYamlTemplateBundle('/repo/template.yaml', {});

    expect(issues.map((issue) => issue.code)).toEqual(['markdown-roundtrip']);
  });
});
