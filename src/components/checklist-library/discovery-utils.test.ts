import { describe, expect, it } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';

import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
} from '@/components/checklist-library/discovery-utils';

const templates: ChecklistTemplate[] = [
  {
    id: 'alpha',
    title: 'Alpha Launch',
    description: 'Launch checklist for teams',
    isPublic: true,
    sections: [
      { id: 'a-1', title: 'One', items: [{ id: 'a-1-1', title: 'Task' }] },
      { id: 'a-2', title: 'Two', items: [{ id: 'a-2-1', title: 'Task' }] },
    ],
    userId: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
    categories: ['Launch', 'Marketing'],
    tags: ['launch', 'release'],
  },
  {
    id: 'beta',
    title: 'Beta Audit',
    description: 'Audit checklist',
    isPublic: true,
    sections: [{ id: 'b-1', title: 'Only', items: [{ id: 'b-1-1', title: 'Task' }, { id: 'b-1-2', title: 'Task' }] }],
    userId: 'user-2',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-10T00:00:00Z',
    categories: ['Security'],
    tags: ['audit', 'security'],
  },
  {
    id: 'gamma',
    title: 'Gamma Planning',
    description: 'Planning checklist',
    isPublic: true,
    sections: [{ id: 'g-1', title: 'Only', items: [{ id: 'g-1-1', title: 'Task' }] }],
    userId: 'user-3',
    createdAt: '2024-04-01T00:00:00Z',
    updatedAt: '2024-04-05T00:00:00Z',
    categories: ['Launch'],
    tags: ['planning'],
  },
];

describe('discovery-utils', () => {
  it('filters templates by search text and category slug, then sorts by recency', () => {
    const filtered = filterAndSortTemplates(templates, {
      categorySlug: 'launch',
      searchQuery: 'launch',
      sortBy: 'recent',
    });

    expect(filtered.map((template) => template.id)).toEqual(['gamma', 'alpha']);
  });

  it('sorts by structural popularity when requested', () => {
    const filtered = filterAndSortTemplates(templates, {
      sortBy: 'popular',
    });

    expect(filtered.map((template) => template.id)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('builds category stats for browse-by-category cards', () => {
    expect(buildDiscoveryCategories(templates)).toEqual([
      { count: 2, name: 'Launch', slug: 'launch' },
      { count: 1, name: 'Marketing', slug: 'marketing' },
      { count: 1, name: 'Security', slug: 'security' },
    ]);
  });
});
