import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateImportPreview } from '@/components/TemplateImportPreview';
import type { ImportPreview } from '@/features/template-backup/importFileSelection';
import type { ChecklistTemplate } from '@/types/checklist';

const template = (id: string, isPublic: boolean): ChecklistTemplate => ({
  id,
  title: `Template ${id}`,
  description: '',
  sections: [{ id: 's', title: 'Prep', items: [{ id: 'i', title: 'Task' }] }],
  userId: 'portable-import',
  createdAt: '2026-03-22T00:00:00.000Z',
  updatedAt: '2026-03-22T00:00:00.000Z',
  isPublic,
});

const previewOf = (templates: ChecklistTemplate[]): ImportPreview => ({
  fileName: 'pack.json',
  templates,
  warnings: [],
});

const render = (preview: ImportPreview, visibility: 'preserve' | 'public' | 'private') =>
  renderToStaticMarkup(
    <TemplateImportPreview
      confirmDisabled={false}
      exceedsTemplateLimit={false}
      isImporting={false}
      maxTemplatesPerImport={5}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      oversizedAssetCount={0}
      preview={preview}
      visibility={visibility}
    />,
  );

describe('TemplateImportPreview', () => {
  const publicPack = previewOf([template('a', true), template('b', true), template('c', true)]);
  const privatePack = previewOf([template('a', false), template('b', false), template('c', false)]);

  it('counts public templates from the file when visibility is preserved', () => {
    expect(render(publicPack, 'preserve')).toContain('>3 public<');
    expect(render(privatePack, 'preserve')).toContain('>0 public<');
  });

  it('counts public templates after the selected visibility override', () => {
    expect(render(publicPack, 'private')).toContain('>0 public<');
    expect(render(privatePack, 'public')).toContain('>3 public<');
  });

  it('names the chosen file and lists its templates', () => {
    const html = render(publicPack, 'preserve');

    expect(html).toContain('pack.json');
    expect(html).toContain('>3 templates<');
    expect(html).toContain('Template a');
  });
});
