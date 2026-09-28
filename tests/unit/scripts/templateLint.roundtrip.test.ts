import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';

const { readFileMock, parseOverride } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  parseOverride: { current: null as null | ((markdown: string) => unknown) },
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

// Lets a test break the Markdown parser to prove the lint catches it.
vi.mock('@/lib/templates/templateMarkdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/templates/templateMarkdown')>();
  return {
    ...actual,
    parseTemplateMarkdown: (markdown: string) =>
      parseOverride.current ? parseOverride.current(markdown) : actual.parseTemplateMarkdown(markdown),
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
    parseOverride.current = null;
  });

  it('accepts a template whose text block holds a heading and a code fence', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);

    expect(await lintYamlTemplateBundle('/repo/template.yaml', {})).toEqual([]);
  });

  it('reports a template whose generated Markdown would not import back', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);
    parseOverride.current = () => {
      throw new Error('Content block "text" is missing a closing fence');
    };

    const issues = await lintYamlTemplateBundle('/repo/template.yaml', {});

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'markdown-roundtrip',
        message: expect.stringContaining('missing a closing fence'),
      }),
    ]);
  });

  it('reports generated Markdown that imports as a different template', async () => {
    readFileMock.mockResolvedValueOnce(yamlWithMarkdownText);
    parseOverride.current = () => ({
      title: 'Setup Guide',
      sections: [{ title: 'Install', items: [{ title: 'Run the installer' }] }],
    });

    const issues = await lintYamlTemplateBundle('/repo/template.yaml', {});

    expect(issues.map((issue) => issue.code)).toEqual(['markdown-roundtrip']);
  });
});
