import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import { lintSingleTemplateSource, lintTemplatePair, lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';
import { renderTemplatePreviewHtml } from '@/../scripts/lib/templatePreviewHtml';
import { renderTemplateReadme } from '@/../scripts/lib/templateReadme';

const folders: string[] = [];

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

function templateFolder(files: Record<string, string>) {
  const folder = mkdtempSync(path.join(tmpdir(), 'template-lint-'));
  folders.push(folder);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(folder, name), text);
  return (name: string) => path.join(folder, name);
}

const template = normalizePortableTemplate({
  title: 'Launch Checklist',
  sections: [{ title: 'Preparation', items: [{ title: 'Review content', description: 'Read every page once.' }] }],
});
const canonicalJson = `${JSON.stringify(template, null, 2)}\n`;
const templateYaml = [
  'title: Launch Checklist',
  'sections:',
  '  - title: Preparation',
  '    items:',
  '      - title: Review content',
  '        description: Read every page once.',
].join('\n');

const codes = (issues: readonly { code: string }[]) => issues.map((issue) => issue.code);

describe('linting one template source', () => {
  it('refuses a file that is not a template source', async () => {
    const file = templateFolder({ 'preview.html': '<html></html>' });
    expect(await lintSingleTemplateSource(file('preview.html'))).toEqual([
      { filePath: file('preview.html'), code: 'unsupported-file-type', message: 'Unsupported template source file type' },
    ]);
  });

  it('passes a canonical JSON template', async () => {
    const file = templateFolder({ 'template.json': canonicalJson });
    expect(await lintSingleTemplateSource(file('template.json'))).toEqual([]);
  });

  it('flags an item with nothing to do and JSON that is not in canonical form', async () => {
    const bare = { title: 'Launch Checklist', sections: [{ title: 'Preparation', items: [{ title: 'Review content' }] }] };
    const file = templateFolder({ 'template.json': JSON.stringify(bare) });
    const issues = await lintSingleTemplateSource(file('template.json'));
    expect(issues).toContainEqual({
      filePath: file('template.json'),
      code: 'empty-item',
      message: 'Item 1.1 "Review content" should include a description or at least one content block',
    });
    expect(codes(issues)).toContain('json-not-normalized');
  });

  it('reports a JSON template that does not parse', async () => {
    const file = templateFolder({ 'template.json': '{ "title": ' });
    const issues = await lintSingleTemplateSource(file('template.json'));
    expect(codes(issues)).toEqual(['parse-error']);
  });

  it('refuses a template pack where a single YAML template belongs', async () => {
    const pack = ['kind: serplists-template-pack', 'schemaVersion: "2.1.0"', 'exportedAt: "2026-01-01T00:00:00Z"', 'templates: []'].join('\n');
    const file = templateFolder({ 'template.yaml': pack });
    expect(await lintSingleTemplateSource(file('template.yaml'))).toEqual([
      {
        filePath: file('template.yaml'),
        code: 'parse-error',
        message: 'YAML template source must define a single template, not a template pack',
      },
    ]);
  });
});

describe('linting a JSON and Markdown pair', () => {
  it('passes a pair generated from one template', async () => {
    const file = templateFolder({ 'template.json': canonicalJson, 'template.md': renderTemplateMarkdown(template) });
    expect(await lintTemplatePair(file('template.json'), file('template.md'))).toEqual([]);
  });

  it('asks for the Markdown to be regenerated and the JSON normalized when neither is in canonical form', async () => {
    const file = templateFolder({
      'template.json': JSON.stringify(template),
      'template.md': `${renderTemplateMarkdown(template)}\n\n`,
    });
    const issues = await lintTemplatePair(file('template.json'), file('template.md'));
    expect(issues).toEqual([
      {
        filePath: file('template.md'),
        code: 'markdown-not-generated',
        message: 'Markdown template should be regenerated from template.json',
      },
      { filePath: file('template.json'), code: 'json-not-normalized', message: 'JSON template does not match canonical normalized formatting' },
    ]);
  });

  it('reports the pair when either file does not parse', async () => {
    const file = templateFolder({ 'template.json': '[]', 'template.md': renderTemplateMarkdown(template) });
    const issues = await lintTemplatePair(file('template.json'), file('template.md'));
    expect(issues).toEqual([
      expect.objectContaining({ filePath: `${file('template.json')} <-> ${file('template.md')}`, code: 'pair-parse-error' }),
    ]);
  });
});

describe('linting a YAML template and the files generated from it', () => {
  it('passes a bundle whose files were all generated from the YAML', async () => {
    const file = templateFolder({
      'template.yaml': templateYaml,
      'template.json': canonicalJson,
      'README.md': renderTemplateReadme(template),
      'preview.html': renderTemplatePreviewHtml(template),
      'template.md': renderTemplateMarkdown(template),
    });
    const issues = await lintYamlTemplateBundle(file('template.yaml'), {
      jsonPath: file('template.json'),
      readmePath: file('README.md'),
      previewHtmlPath: file('preview.html'),
      markdownPath: file('template.md'),
    });
    expect(issues).toEqual([]);
  });

  it('asks for stale JSON and strict Markdown to be regenerated', async () => {
    const file = templateFolder({ 'template.yml': templateYaml, 'template.json': '{}\n', 'template.md': '# Old\n' });
    const issues = await lintYamlTemplateBundle(file('template.yml'), {
      jsonPath: file('template.json'),
      markdownPath: file('template.md'),
    });
    expect(issues).toEqual([
      { filePath: file('template.json'), code: 'json-not-generated', message: 'JSON artifact should be regenerated from template.yml' },
      {
        filePath: file('template.md'),
        code: 'markdown-not-generated',
        message: 'Strict Markdown artifact should be regenerated from template.yml',
      },
    ]);
  });

  it('reports YAML that is not a template', async () => {
    const file = templateFolder({ 'template.yaml': 'just a string' });
    expect(await lintYamlTemplateBundle(file('template.yaml'), {})).toEqual([
      { filePath: file('template.yaml'), code: 'yaml-bundle-parse-error', message: 'YAML template source must be an object' },
    ]);
  });

  it('refuses a bundle whose source is not a template file, without reading it', async () => {
    const file = templateFolder({});

    expect(await lintYamlTemplateBundle(file('notes.txt'), {})).toEqual([
      { filePath: file('notes.txt'), code: 'unsupported-file-type', message: 'Unsupported template source file type' },
    ]);
  });

  it('reads a bundle source in the format its file name gives, so a Markdown source parses as Markdown', async () => {
    const file = templateFolder({ 'template.md': renderTemplateMarkdown(template), 'template.json': canonicalJson });

    expect(await lintYamlTemplateBundle(file('template.md'), { jsonPath: file('template.json') })).toEqual([]);
  });
});
