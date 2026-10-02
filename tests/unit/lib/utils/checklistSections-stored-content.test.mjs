import { describe, expect, it } from 'vitest';

import { getSectionDisplayTitle, getSubItemDisplayTitle } from '@/lib/utils/checklistSections';

describe('display titles of content stored before writes were checked, which the declared types rule out', () => {
  it('falls back for a missing or non-text title, which content stored before writes were checked can hold', () => {
    expect(getSectionDisplayTitle({}, 0)).toBe('Section 1');
    expect(getSubItemDisplayTitle({ title: 42 }, 0)).toBe('Sub-task 1');
  });
});
