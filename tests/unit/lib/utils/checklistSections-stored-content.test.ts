import { describe, expect, it } from 'vitest';

import { getSectionDisplayTitle, getSubItemDisplayTitle, normalizeSections } from '@/lib/utils/checklistSections';
import { contentAt, elementAt, subTaskAt, taskIn } from '../../../support/elements';

describe('display titles of content stored before writes were checked, which the declared types rule out', () => {
  it('falls back for a missing or non-text title, which content stored before writes were checked can hold', () => {
    const stored: unknown = [
      { items: [] },
      { title: 42, items: [{ title: 'Pack', contents: [{ type: 'subItems', value: '', subItems: [{ title: 42 }] }] }] },
    ];
    const sections = normalizeSections(stored);

    expect(sections.map((section, index) => getSectionDisplayTitle(section, index))).toEqual(['Checklist', 'Checklist']);
    expect(getSubItemDisplayTitle(subTaskAt(contentAt(taskIn(sections, 1, 0), 0), 0), 0)).toBe('Sub-task 1');
    expect(getSectionDisplayTitle({ ...elementAt(sections, 0), title: ' ' }, 0)).toBe('Section 1');
  });
});
