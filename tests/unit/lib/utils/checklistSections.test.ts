import { describe, expect, it } from 'vitest';

import {
  getSectionDisplayTitle,
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
