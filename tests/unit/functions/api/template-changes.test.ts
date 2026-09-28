import { describe, expect, it } from 'vitest';

import {
  omitUnchangedTemplateColumns,
  templateStructureChanged,
} from '@functions/api/utils/template-changes';
import { assignMissingStableTemplateIdentities } from '@functions/api/utils/template-reconciliation';

const storedSections = [
  {
    id: 'section-1',
    title: 'Launch',
    items: [
      {
        id: 'item-1',
        title: 'Write copy',
        description: 'Draft it',
        contents: [
          { id: 'content-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Short' }] },
        ],
      },
      { id: 'item-2', title: 'Publish' },
    ],
  },
];

// What the editor sends back for the stored sections above: other key order, injected
// run state, and empty defaults for fields the stored JSON never had.
const editorSections = [
  {
    title: 'Launch',
    id: 'section-1',
    items: [
      {
        isCompleted: false,
        contents: [
          {
            value: '',
            type: 'subItems',
            id: 'content-1',
            fileName: undefined,
            subItems: [{ title: 'Short', id: 'sub-1', isCompleted: false }],
          },
        ],
        description: 'Draft it',
        title: 'Write copy',
        id: 'item-1',
      },
      { id: 'item-2', title: 'Publish', description: '', contents: [], isCompleted: false, completed: false, notes: '' },
    ],
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const changed = (stored: unknown[], incoming: unknown[]) =>
  templateStructureChanged(stored, assignMissingStableTemplateIdentities(incoming, stored));

describe('templateStructureChanged', () => {
  it('treats resent sections with run state, key order, and empty defaults as unchanged', () => {
    expect(changed(storedSections, editorSections)).toBe(false);
  });

  it('treats an empty template and a missing items value as unchanged', () => {
    expect(changed([], [])).toBe(false);
  });

  it('matches legacy flat item arrays against the canonical Checklist section', () => {
    const legacy = [{ id: 'item-1', title: 'Only task' }];
    const sectionShape = [{ id: '1', title: 'Checklist', items: [{ id: 'item-1', title: 'Only task', isCompleted: false }] }];
    expect(changed(legacy, sectionShape)).toBe(false);
  });

  it('matches stored sections without ids against the ids assigned by position', () => {
    const withoutIds = [{ title: 'Prep', items: [{ title: 'Pack' }, { title: 'Drive' }] }];
    expect(changed(withoutIds, clone(withoutIds))).toBe(false);
  });

  it.each([
    ['an item title is renamed', (sections: typeof editorSections) => { sections[0].items[1].title = 'Ship'; }],
    ['items are reordered', (sections: typeof editorSections) => { sections[0].items.reverse(); }],
    ['an item is added', (sections: typeof editorSections) => {
      sections[0].items.push({ id: 'item-3', title: 'Announce' } as (typeof editorSections)[0]['items'][1]);
    }],
    ['a sub-item is added under contents', (sections: typeof editorSections) => {
      sections[0].items[0].contents[0].subItems.push({ title: 'Long', id: 'sub-2', isCompleted: false });
    }],
    ['a description changes', (sections: typeof editorSections) => { sections[0].items[0].description = 'Draft and edit'; }],
  ])('reports a change when %s', (_label, mutate) => {
    const incoming = clone(editorSections);
    mutate(incoming);
    expect(changed(storedSections, incoming)).toBe(true);
  });
});

describe('omitUnchangedTemplateColumns', () => {
  const stored = {
    title: 'Launch plan',
    description: null,
    type: null,
    seo_title: '',
    seo_description: 'About launches',
    rules: JSON.stringify([{ id: 'rule-1', type: 'required-field', path: 'title', severity: 'error' }]),
    category: '["seo"]',
    tags: '[]',
    slug: 'launch-plan',
    is_public: 0,
  };

  it('drops values that match the stored row', () => {
    expect(omitUnchangedTemplateColumns(stored, {
      title: 'Launch plan',
      description: '',
      type: 'checklist',
      seo_title: '',
      seo_description: 'About launches',
      rules: JSON.stringify([{ severity: 'error', path: 'title', type: 'required-field', id: 'rule-1' }]),
      category: JSON.stringify(['seo']),
      tags: JSON.stringify([]),
      slug: 'launch-plan',
      is_public: false,
    })).toEqual({});
  });

  it('keeps changed values and always keeps items', () => {
    expect(omitUnchangedTemplateColumns(stored, {
      title: 'Launch plan v2',
      is_public: true,
      rules: null,
      items: '[]',
    })).toEqual({ title: 'Launch plan v2', is_public: true, rules: null, items: '[]' });
  });

  it('treats a missing rules column and cleared rules as unchanged', () => {
    expect(omitUnchangedTemplateColumns({ title: 'Launch plan' }, { rules: null })).toEqual({});
  });
});

