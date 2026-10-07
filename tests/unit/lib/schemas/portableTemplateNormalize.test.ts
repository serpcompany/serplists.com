import { describe, expect, it } from 'vitest';
import { taskAt } from '../../../support/elements';

import { parsePortableTemplate } from '@/lib/schemas/portableTemplateNormalize';

describe('parsePortableTemplate', () => {
  it('keeps sub-items only on Sub-tasks blocks, the only ones the run page shows', () => {
    const result = parsePortableTemplate({
      title: 'Launch plan',
      sections: [{
        title: 'Launch',
        items: [{
          title: 'Write copy',
          contents: [
            { type: 'text', value: 'Steps', subItems: [{ title: 'Hidden' }] },
            { type: 'image', value: 'https://example.com/a.png', subItems: [{ title: 'Hidden too' }] },
            { type: 'subItems', value: '', subItems: [{ title: 'Visible' }] },
          ],
        }],
      }],
    });

    expect(result.success).toBe(true);
    const contents = result.success ? taskAt(result.data, 0, 0).contents : [];
    expect(contents?.map((content) => [content.type, content.subItems])).toEqual([
      ['text', undefined],
      ['image', undefined],
      ['subItems', [{ title: 'Visible' }]],
    ]);
  });
});

const templateWithContents = (contents: unknown[]) => ({
  title: 'Launch',
  sections: [{ title: 'Prep', items: [{ title: 'Write copy', contents }] }],
});

const contentsOf = (contents: unknown[]) => {
  const result = parsePortableTemplate(templateWithContents(contents));
  if (!result.success) throw new Error(result.reason);
  return taskAt(result.data, 0, 0).contents;
};

describe('parsePortableTemplate content blocks with ids or file details the strict schema rejects, which an older pack can hold', () => {
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

  it('cleans Sub-task ids, drops blank Sub-tasks, and drops sub-items on other blocks', () => {
    expect(
      contentsOf([
        { id: 'c1', type: 'subItems', value: '', subItems: [{ id: 5, title: 'One' }, { id: null, title: 'Two' }] },
        { id: 'c2', type: 'text', value: 'Note', subItems: [{ id: 's3', title: '' }] },
        { id: 'c3', type: 'text', value: 'Other', subItems: null },
      ]),
    ).toEqual([
      { id: 'c1', type: 'subItems', value: '', subItems: [{ id: '5', title: 'One' }, { title: 'Two' }] },
      { id: 'c2', type: 'text', value: 'Note' },
      { id: 'c3', type: 'text', value: 'Other' },
    ]);
  });

  it('cleans form blocks: drops answers, blank fields, blank options, choice fields left without options and forms left empty', () => {
    expect(
      contentsOf([
        {
          id: 'c1',
          type: 'form',
          value: '',
          subItems: [{ title: 'Hidden' }],
          fields: [
            { id: 7, label: 'Name', kind: 'text', required: true, answer: 'Acme', options: [{ label: 'x' }], min: 1 },
            { id: 'f2', label: '  ', kind: 'text' },
            { id: 'f3', label: 'Color', kind: 'color' },
            { id: 'f4', label: 'Plan', kind: 'select', required: 'yes', options: [{ id: 2, label: 'Pro' }, { label: ' ' }], answer: '2' },
            { id: 'f5', label: 'Tags', kind: 'multiSelect', options: [{ label: '' }] },
            { id: 'f6', label: 'Seats', kind: 'number', min: 1, max: 'nine', description: 7 },
            'x',
          ],
        },
        { id: 'c2', type: 'form', value: '', fields: [{ label: '', kind: 'text' }] },
        { id: 'c3', type: 'text', value: 'Note', fields: [{ label: 'Stray', kind: 'text' }] },
      ]),
    ).toEqual([
      {
        id: 'c1',
        type: 'form',
        value: '',
        fields: [
          { id: '7', label: 'Name', kind: 'text', required: true },
          { id: 'f4', label: 'Plan', kind: 'select', options: [{ id: '2', label: 'Pro' }] },
          { id: 'f6', label: 'Seats', kind: 'number', min: 1 },
        ],
      },
      { id: 'c3', type: 'text', value: 'Note' },
    ]);
  });
});
