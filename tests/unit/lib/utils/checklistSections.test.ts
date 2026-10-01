import { describe, expect, it } from 'vitest';
import { elementAt, firstOf } from '../../../support/elements';

import {
  calculateSectionsProgress,
  getSectionDisplayTitle,
  normalizeSections,
  getSubItemDisplayTitle,
  resetSectionsCompletion,
  sectionFallbackTitle,
} from '@/lib/utils/checklistSections';

import { findStoredSectionsIssue } from '@/lib/schemas/storedSections';
import {
  MALFORMED_CONTENTS_A_TEMPLATE_STORED,
  malformedSectionsStoredBeforeValidation,
  sectionsWithContents,
  THE_SAME_CONTENTS_MADE_SAFE,
} from '../../../fixtures/malformedSections';

describe('section and sub-task display titles', () => {
  it('names a section by its 1-based position', () => {
    expect(sectionFallbackTitle(0)).toBe('Section 1');
    expect(sectionFallbackTitle(2)).toBe('Section 3');
  });

  it('falls back for a blank or whitespace-only section title', () => {
    expect(getSectionDisplayTitle({ title: '' }, 0)).toBe('Section 1');
    expect(getSectionDisplayTitle({ title: '   ' }, 1)).toBe('Section 2');
    expect(getSectionDisplayTitle({ title: ' Prep ' }, 1)).toBe('Prep');
  });

  it('falls back for a blank sub-task title', () => {
    expect(getSubItemDisplayTitle({ title: '' }, 1)).toBe('Sub-task 2');
    expect(getSubItemDisplayTitle({ title: 'Check title' }, 0)).toBe('Check title');
  });

  it('falls back for a missing or non-text title, which content stored before writes were checked can hold', () => {
    expect(getSectionDisplayTitle({} as { title: string }, 0)).toBe('Section 1');
    expect(getSubItemDisplayTitle({ title: 42 } as unknown as { title: string }, 0)).toBe('Sub-task 1');
  });
});

describe('normalizeSections with entries that are not objects', () => {
  const numericKeys = (value: object) => Object.keys(value).filter((key) => /^\d+$/.test(key));

  it('turns text tasks into titled tasks and skips entries that are not tasks, instead of spreading their characters into keys', () => {
    const section = firstOf(normalizeSections([
      { id: 's1', title: 'Shop', items: ['Milk', '  ', null, 5, ['x'], true, ' Eggs ', { id: 'i-3', title: 'Bread' }] },
    ]));

    expect(section.items.map((item) => item.title)).toEqual(['Milk', 'Eggs', 'Bread']);
    for (const item of section.items) {
      expect(numericKeys(item)).toEqual([]);
      expect(item.isCompleted).toBe(false);
      expect(typeof item.id).toBe('string');
    }
    expect(elementAt(section.items, 2).id).toBe('i-3');
  });

  it('turns text sub-tasks into titled sub-tasks and skips other entries', () => {
    const section = firstOf(normalizeSections([
      {
        id: 's1',
        title: 'Shop',
        items: [
          {
            id: 'i1',
            title: 'Dairy',
            contents: [
              'stray text',
              null,
              { id: 'c1', type: 'subItems', value: '', subItems: ['ab', '', 7, null, { id: 'si', title: 'Cheese', completed: true }] },
            ],
          },
        ],
      },
    ]));

    const contents = firstOf(section.items).contents ?? [];
    expect(contents).toHaveLength(1);
    const subItems = firstOf(contents).subItems ?? [];
    expect(subItems.map((subItem) => subItem.title)).toEqual(['ab', 'Cheese']);
    expect(subItems.map((subItem) => subItem.isCompleted)).toEqual([false, true]);
    for (const subItem of subItems) expect(numericKeys(subItem)).toEqual([]);
  });

  it('skips sections that are not objects without changing the position-based ids of the others', () => {
    const sections = normalizeSections([
      null,
      'Loose',
      { title: 'Kept', items: [{ title: 'Task', isCompleted: true, notes: 'n' }] },
    ]);

    expect(sections).toEqual([
      {
        id: '3',
        title: 'Kept',
        items: [{ id: '3-1', title: 'Task', isCompleted: true, notes: 'n', contents: undefined }],
      },
    ]);
  });
});

describe('normalizeSections on stored content', () => {
  it.each(malformedSectionsStoredBeforeValidation)('never throws on %s, and the result saves back without a 400', (_label, sections) => {
    const normalized = normalizeSections(sections);

    expect(() => calculateSectionsProgress(normalized)).not.toThrow();
    expect(() => resetSectionsCompletion(normalized)).not.toThrow();
    expect(findStoredSectionsIssue(normalized)).toBeNull();
  });

  it('turns a malformed Sub-task list into an empty one and a non-text value into empty text', () => {
    const section = firstOf(normalizeSections(sectionsWithContents(...MALFORMED_CONTENTS_A_TEMPLATE_STORED)));

    expect(firstOf(section.items).contents).toEqual(THE_SAME_CONTENTS_MADE_SAFE);
    expect(calculateSectionsProgress([section])).toBe(0);
  });

  it('keeps valid content and legacy completion as before', () => {
    const section = firstOf(normalizeSections([{
      id: 's1',
      title: 'Launch',
      items: [{
        id: 'i1',
        title: 'Task',
        completed: true,
        notes: 'Keep',
        contents: [{ id: 'c', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', completed: true }] }],
      }],
    }]));

    expect(section.items[0]).toEqual({
      id: 'i1',
      title: 'Task',
      isCompleted: true,
      notes: 'Keep',
      contents: [{ id: 'c', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', isCompleted: true }] }],
    });
    expect(calculateSectionsProgress([section])).toBe(100);
  });
});
