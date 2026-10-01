import { describe, expect, it } from 'vitest';

import { formatCount, pluralize } from '@/lib/utils/pluralize';

describe('pluralize', () => {
  it('uses the singular for exactly one and the plural otherwise', () => {
    expect(pluralize(1, 'template')).toBe('template');
    expect(pluralize(0, 'template')).toBe('templates');
    expect(pluralize(2, 'template')).toBe('templates');
  });

  it('takes an irregular plural', () => {
    expect(pluralize(2, 'category', 'categories')).toBe('categories');
    expect(pluralize(1, 'category', 'categories')).toBe('category');
  });
});

describe('formatCount', () => {
  it('puts the count before its noun', () => {
    expect(formatCount(1, 'section')).toBe('1 section');
    expect(formatCount(0, 'task')).toBe('0 tasks');
    expect(formatCount(12, 'task')).toBe('12 tasks');
  });
});
