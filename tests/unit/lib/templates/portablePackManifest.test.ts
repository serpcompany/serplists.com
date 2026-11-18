import { describe, expect, it } from 'vitest';

import { buildPortableTemplatePack, type PortableExportSource } from '@functions/api/utils/template-portable';

const source = (sections: unknown[]): PortableExportSource => ({
  id: 'template-1',
  title: 'Launch kit',
  description: '',
  type: 'checklist',
  seoTitle: '',
  seoDescription: '',
  sections,
  categories: [],
  tags: [],
  isPublic: false,
  slug: 'launch-kit',
});

describe("an export pack's manifest", () => {
  it('counts the uploaded files the templates point to, and no linked file or text that mentions an upload', () => {
    const pack = buildPortableTemplatePack(
      [
        source([
          {
            id: 's1',
            title: 'Assets',
            items: [
              {
                id: 'i1',
                title: 'Logo',
                contents: [
                  { id: 'c1', type: 'image', value: 'https://cdn.example.com/logo.png', uploadType: 'upload' },
                  { id: 'c2', type: 'file', value: '/api/uploads/file?key=template-files%2Fu1%2Fbrief.pdf' },
                  { id: 'c3', type: 'image', value: 'https://example.com/linked.png', uploadType: 'url' },
                  { id: 'c4', type: 'text', value: 'Upload it to /api/uploads/file first' },
                ],
              },
              { id: 'i2', title: 'Ship it' },
            ],
          },
        ]),
      ],
      undefined,
    );

    expect(pack.manifest).toEqual({ totalTemplates: 1, format: 'portable', includesVisibility: true, includesRules: false, assetWarnings: 2 });
  });

  it('says nothing about visibility, rules or assets for an export with no templates', () => {
    expect(buildPortableTemplatePack([], undefined).manifest).toEqual({
      totalTemplates: 0,
      format: 'portable',
      includesVisibility: false,
      includesRules: false,
      assetWarnings: 0,
    });
  });
});
