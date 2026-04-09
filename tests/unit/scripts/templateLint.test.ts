import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lintSingleTemplateSource, lintTemplatePair, lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

describe('templateLint', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flags non-canonical markdown formatting', async () => {
    readFileMock.mockResolvedValue([
      '---',
      'title: Launch Checklist',
      '---',
      '# Launch Checklist',
      '',
      '## Preparation',
      '',
      '### Review content',
      '',
      'Just description text.',
    ].join('\n'));

    const issues = await lintSingleTemplateSource('/repo/template.md');

    expect(issues.some((issue) => issue.code === 'markdown-not-canonical')).toBe(true);
  });

  it('flags drift between sibling json and markdown templates', async () => {
    readFileMock
      .mockResolvedValueOnce(JSON.stringify({
        title: 'Launch Checklist',
        sections: [
          {
            title: 'Preparation',
            items: [
              {
                title: 'Review content',
                contents: [{ type: 'text', value: 'Canonical body' }],
              },
            ],
          },
        ],
      }, null, 2))
      .mockResolvedValueOnce([
        '---',
        'title: Launch Checklist',
        '---',
        '# Launch Checklist',
        '',
        '## Preparation',
        '',
        '### Review content',
        '',
        '```serplists:text',
        'Different body',
        '```',
      ].join('\n'));

    const issues = await lintTemplatePair('/repo/template.json', '/repo/template.md');

    expect(issues.some((issue) => issue.code === 'json-markdown-drift')).toBe(true);
  });

  it('flags drift between yaml source and generated readme/html artifacts', async () => {
    readFileMock
      .mockResolvedValueOnce([
        'title: Launch Checklist',
        'sections:',
        '  - title: Preparation',
        '    items:',
        '      - title: Review content',
        '        contents:',
        '          - type: text',
        '            value: Canonical body',
      ].join('\n'))
      .mockResolvedValueOnce(JSON.stringify({
        title: 'Launch Checklist',
        sections: [
          {
            title: 'Preparation',
            items: [
              {
                title: 'Review content',
                contents: [{ type: 'text', value: 'Canonical body' }],
              },
            ],
          },
        ],
      }, null, 2) + '\n')
      .mockResolvedValueOnce('# wrong readme\n')
      .mockResolvedValueOnce('<html>wrong html</html>');

    const issues = await lintYamlTemplateBundle('/repo/template.yaml', {
      jsonPath: '/repo/template.json',
      readmePath: '/repo/README.md',
      previewHtmlPath: '/repo/preview.html',
    });

    expect(issues.some((issue) => issue.code === 'readme-not-generated')).toBe(true);
    expect(issues.some((issue) => issue.code === 'preview-html-not-generated')).toBe(true);
  });
});
