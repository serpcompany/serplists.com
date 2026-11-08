import { describe, expect, it } from 'vitest';

import { buildDiscoveryCategories, filterAndSortTemplates } from '@/components/checklist-library/discovery-utils';
import type { ChecklistTemplate } from '@/types/checklist';

import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';

const sectionWithTasks = (count: number) => ({
  id: `section-${count}`,
  title: 'Steps',
  items: Array.from({ length: count }, (_, index) => ({ id: `task-${index}`, title: `Task ${index + 1}` })),
});

const template = (title: string, overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  ...PRIVATE_LAUNCH_TEMPLATE,
  id: title,
  title,
  sections: [sectionWithTasks(1)],
  ...overrides,
});

const titlesOf = (templates: ChecklistTemplate[]) => templates.map(({ title }) => title);

describe('the Trending sort of the library', () => {
  it('puts the Templates with the most tasks first', () => {
    const sorted = filterAndSortTemplates(
      [template('Two tasks', { sections: [sectionWithTasks(2)] }), template('Five tasks', { sections: [sectionWithTasks(5)] })],
      { sortBy: 'trending' },
    );

    expect(titlesOf(sorted)).toEqual(['Five tasks', 'Two tasks']);
  });

  it('puts the most recently updated first among Templates with as many tasks', () => {
    const sorted = filterAndSortTemplates(
      [template('Older', { updatedAt: '2026-01-01T00:00:00.000Z' }), template('Newer', { updatedAt: '2026-03-01T00:00:00.000Z' })],
      { sortBy: 'trending' },
    );

    expect(titlesOf(sorted)).toEqual(['Newer', 'Older']);
  });

  it('falls back to the Popular order, more sections first, when tasks and updates tie', () => {
    const sorted = filterAndSortTemplates(
      [
        template('One section', { sections: [sectionWithTasks(2)] }),
        template('Two sections', { sections: [sectionWithTasks(1), { ...sectionWithTasks(1), id: 'second' }] }),
      ],
      { sortBy: 'trending' },
    );

    expect(titlesOf(sorted)).toEqual(['Two sections', 'One section']);
  });
});

describe('Templates with no categories in the library', () => {
  const uncategorized: ChecklistTemplate = {
    id: 'packing',
    title: 'Packing list',
    type: 'checklist',
    sections: [sectionWithTasks(1)],
    userId: 'user-1',
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z',
    isPublic: true,
  };

  it('can still be found by their title', () => {
    expect(titlesOf(filterAndSortTemplates([uncategorized], { searchQuery: 'packing', sortBy: 'popular' }))).toEqual(['Packing list']);
  });

  it('add to no category', () => {
    expect(buildDiscoveryCategories([uncategorized, template('Launch', { categories: ['Marketing'] })])).toEqual([
      { count: 1, name: 'Marketing', slug: 'marketing' },
    ]);
  });
});
