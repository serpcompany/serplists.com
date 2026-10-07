import { describe, it, expect } from 'vitest';
import { normalizeSectionsPayload, parseSectionsPayload } from '@functions/api/utils/payloads';
import { isSectionedList } from '@/lib/schemas/storedSections';

const sectionsWithNestedContent = [
  {
    id: 'section-1',
    title: 'Test Section',
    items: [
      {
        id: 'item-1',
        title: 'Item with nested content',
        description: 'A description',
        contents: [
          { id: 'c-1', type: 'text', value: 'Some text' },
          { id: 'c-2', type: 'image', value: 'image.jpg' },
          { id: 'c-3', type: 'subItems', value: '', subItems: [{ id: 's-1', title: 'Sub-item 1' }, { id: 's-2', title: 'Sub-item 2' }] },
        ],
      },
    ],
  },
];

const legacyFlatItems = [{ id: 'i-1', title: 'Item 1', completed: false }];

describe('the sections a Template write or import stores', () => {
  it('keeps every section with its descriptions, content blocks and Sub-tasks, since flattening them once emptied imported Templates in the editor', () => {
    expect(parseSectionsPayload(sectionsWithNestedContent)).toEqual({ sections: sectionsWithNestedContent });
    expect(normalizeSectionsPayload(sectionsWithNestedContent)).toEqual({ sections: sectionsWithNestedContent });
  });

  it('reads sections stored as a JSON string the same way', () => {
    expect(parseSectionsPayload(JSON.stringify(sectionsWithNestedContent))).toEqual({ sections: sectionsWithNestedContent });
  });

  it('tells sections from legacy flat items', () => {
    expect(isSectionedList(sectionsWithNestedContent)).toBe(true);
    expect(isSectionedList(legacyFlatItems)).toBe(false);
  });

  it('wraps legacy flat items in one Checklist section and keeps sections as they are', () => {
    expect(normalizeSectionsPayload(JSON.stringify(legacyFlatItems)).sections).toEqual([
      { id: '1', title: 'Checklist', items: legacyFlatItems },
    ]);
    expect(normalizeSectionsPayload(JSON.stringify(sectionsWithNestedContent)).sections).toEqual(sectionsWithNestedContent);
  });
});
