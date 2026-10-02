import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';
import { renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import { parseTemplatesFromData, parseTemplatesFromFile } from '@/lib/utils/templateBackup';
import type { ChecklistItemContent, ChecklistTemplate } from '@/types/checklist';

const namedLinksWithoutUploadType = [
  {
    id: 'file-1',
    type: 'file',
    value: 'https://example.com/guide.pdf',
    fileName: 'Setup guide.pdf',
    fileSize: 2048,
  },
  { id: 'image-1', type: 'image', value: 'https://example.com/diagram.png', fileName: 'Diagram' },
  { id: 'video-1', type: 'video', value: 'https://example.com/walkthrough.mp4', fileName: 'Walkthrough' },
];

const templateWith = (contents: unknown[]) => ({
  title: 'Setup',
  sections: [
    {
      id: 'section-1',
      title: 'Install',
      items: [{ id: 'item-1', title: 'Read the guide', description: '', contents }],
    },
  ],
});

const importPack = (contents: unknown[]): ChecklistTemplate =>
  parseTemplatesFromData({
    kind: 'serplists-template-pack',
    schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
    exportedAt: '2026-09-01T00:00:00.000Z',
    templates: [{ ...templateWith(contents), visibility: 'private' }],
  }).templates[0];

const importedContents = (template: ChecklistTemplate): ChecklistItemContent[] =>
  template.sections[0].items[0].contents ?? [];

describe('importing a linked file its author named without the uploadType a hand-written pack may leave out', () => {
  it('marks it as a link so the editor, which keeps a name only next to a link, keeps its name and size', () => {
    const template = importPack(namedLinksWithoutUploadType);

    expect(importedContents(template).map((content) => content.uploadType)).toEqual([
      'url',
      'url',
      'url',
    ]);

    const editorContents = buildTemplateEditorFormValues(template).sections[0].items[0].contents;
    expect(editorContents.map((content) => content.fileName)).toEqual([
      'Setup guide.pdf',
      'Diagram',
      'Walkthrough',
    ]);
    expect(editorContents[0].fileSize).toBe(2048);
  });

  it('shows the name in runs', () => {
    const markup = renderToStaticMarkup(
      <ContentRenderer contents={importedContents(importPack(namedLinksWithoutUploadType.slice(0, 1)))} />,
    );

    expect(markup).toContain('Setup guide.pdf');
  });

  it('marks it in an app backup too', () => {
    const [template] = parseTemplatesFromData([templateWith(namedLinksWithoutUploadType.slice(0, 1))]).templates;

    expect(importedContents(template)[0]).toMatchObject({
      uploadType: 'url',
      fileName: 'Setup guide.pdf',
    });
  });

  it('marks it in a Markdown file', async () => {
    const markdown = renderTemplateMarkdown(templateWith(namedLinksWithoutUploadType.slice(0, 1)) as never);

    const { templates } = await parseTemplatesFromFile(
      new File([markdown], 'template.md', { type: 'text/markdown' }),
    );

    expect(importedContents(templates[0])[0]).toMatchObject({
      uploadType: 'url',
      fileName: 'Setup guide.pdf',
    });
  });

  it('leaves uploads, stated upload types, unnamed links and other blocks as they are', () => {
    const contents = importedContents(
      importPack([
        { id: 'upload-1', type: 'file', value: '/api/uploads/file?key=template-files/a.pdf', fileName: 'a.pdf' },
        { id: 'stated-1', type: 'file', value: 'https://example.com/b.pdf', fileName: 'b.pdf', uploadType: 'upload' },
        { id: 'unnamed-1', type: 'file', value: 'https://example.com/c.pdf' },
        { id: 'text-1', type: 'text', value: 'Notes', fileName: 'notes.txt' },
      ]),
    );

    expect(contents.map((content) => content.uploadType)).toEqual([
      undefined,
      'upload',
      undefined,
      undefined,
    ]);
  });
});
