import { describe, expect, it } from 'vitest';

import { parsePortableTemplate } from '@/lib/schemas/portableTemplateNormalize';

// Export and import share this normalizer so every pack SERP Lists wrote can be read back,
// including packs that hold content ids or file details the strict schema does not accept.
const templateWithContents = (contents: unknown[]) => ({
  title: 'Launch',
  sections: [{ title: 'Prep', items: [{ title: 'Write copy', contents }] }],
});

const contentsOf = (contents: unknown[]) => {
  const result = parsePortableTemplate(templateWithContents(contents));
  if (!result.success) throw new Error(result.reason);
  return result.data.sections[0].items[0].contents;
};

describe('parsePortableTemplate content blocks', () => {
  it('turns a numeric id into a string and drops null or ill-typed optional keys', () => {
    expect(
      contentsOf([
        { id: 3, type: 'file', value: 'https://x/a.pdf', fileName: null, fileSize: null, uploadType: null },
        { id: true, type: 'image', value: 'https://x/b.png', fileName: 7, fileSize: Number.NaN, uploadType: 'URL' },
      ]),
    ).toEqual([
      { id: '3', type: 'file', value: 'https://x/a.pdf' },
      { type: 'image', value: 'https://x/b.png' },
    ]);
  });

  it('keeps a valid block exactly as it is', () => {
    const block = { id: 'c1', type: 'file', value: 'https://x/a.pdf', uploadType: 'upload', fileName: 'a.pdf', fileSize: 10 };

    expect(contentsOf([block])).toEqual([block]);
  });

  it('cleans Sub-task ids and drops blank Sub-tasks on any block', () => {
    expect(
      contentsOf([
        { id: 'c1', type: 'subItems', value: '', subItems: [{ id: 5, title: 'One' }, { id: null, title: 'Two' }] },
        { id: 'c2', type: 'text', value: 'Note', subItems: [{ id: 's3', title: '' }] },
        { id: 'c3', type: 'text', value: 'Other', subItems: null },
      ]),
    ).toEqual([
      { id: 'c1', type: 'subItems', value: '', subItems: [{ id: '5', title: 'One' }, { title: 'Two' }] },
      { id: 'c2', type: 'text', value: 'Note', subItems: [] },
      { id: 'c3', type: 'text', value: 'Other' },
    ]);
  });
});
