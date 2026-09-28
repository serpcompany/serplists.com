import { describe, expect, it } from 'vitest';

import {
  getSectionDisplayTitle,
  normalizeSections,
  getSubItemDisplayTitle,
  sectionFallbackTitle,
} from '@/lib/utils/checklistSections';

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

  // Stored JSON is not validated (TD-3), so a title can be missing or not a string.
  it('falls back for a missing title', () => {
    expect(getSectionDisplayTitle({} as { title: string }, 0)).toBe('Section 1');
    expect(getSubItemDisplayTitle({ title: 42 } as unknown as { title: string }, 0)).toBe('Sub-task 1');
  });
});

describe('normalizeSections with entries that are not objects', () => {
  const numericKeys = (value: object) => Object.keys(value).filter((key) => /^\d+$/.test(key));

  it('turns text tasks into titled tasks and skips entries that are not tasks', () => {
    const [section] = normalizeSections([
      { id: 's1', title: 'Shop', items: ['Milk', '  ', null, 5, ['x'], true, ' Eggs ', { id: 'i-3', title: 'Bread' }] },
    ]);

    expect(section.items.map((item) => item.title)).toEqual(['Milk', 'Eggs', 'Bread']);
    for (const item of section.items) {
      expect(numericKeys(item)).toEqual([]);
      expect(item.isCompleted).toBe(false);
      expect(typeof item.id).toBe('string');
    }
    expect(section.items[2].id).toBe('i-3');
  });

  it('turns text sub-tasks into titled sub-tasks and skips other entries', () => {
    const [section] = normalizeSections([
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
    ]);

    const contents = section.items[0].contents ?? [];
    expect(contents).toHaveLength(1);
    const subItems = contents[0].subItems ?? [];
    expect(subItems.map((subItem) => subItem.title)).toEqual(['ab', 'Cheese']);
    expect(subItems.map((subItem) => subItem.isCompleted)).toEqual([false, true]);
    for (const subItem of subItems) expect(numericKeys(subItem)).toEqual([]);
  });

  it('skips sections that are not objects and keeps the other sections unchanged', () => {
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
