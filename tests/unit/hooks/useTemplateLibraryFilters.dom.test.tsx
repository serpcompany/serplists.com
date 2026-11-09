import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import type { ChecklistTemplate } from '@/types/checklist';

const catalog = vi.hoisted(() => ({ templates: [] as ChecklistTemplate[] }));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({
    templates: catalog.templates,
    catalogPending: false,
    catalogError: false,
    refetchCatalog: vi.fn(),
  }),
}));

const publicTemplate = (
  id: string,
  title: string,
  extra: Pick<ChecklistTemplate, 'description' | 'categories'> = {},
): ChecklistTemplate => ({
  id,
  title,
  slug: id,
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
  ownerProfile: { username: 'alice' },
  ...extra,
});

const movingDay = publicTemplate('moving-day', 'Moving Day', { categories: ['Home Moving'] });
const roadTrip = publicTemplate('road-trip', 'Road Trip', { description: 'Pack the car the night before', categories: ['Travel'] });
const packingList = publicTemplate('packing-list', 'Packing List');
const campWeekend = publicTemplate('camp-weekend', 'Camp Weekend', { description: 'Outdoors', categories: ['Packing'] });
const taxes = publicTemplate('taxes', 'Taxes');

const shownIds = (templates: readonly ChecklistTemplate[]) => templates.map((template) => template.id);

beforeEach(() => {
  catalog.templates = [movingDay, roadTrip, packingList, campWeekend, taxes];
});

describe('the template library filters', () => {
  it('shows every public template while no category, chosen category or search narrows it', () => {
    const { result } = renderHook(() => useTemplateLibrary());

    expect(shownIds(result.current.filteredTemplates)).toEqual(shownIds(catalog.templates));
    expect(result.current.searchQuery).toBe('');
    expect(result.current.selectedCategories).toEqual([]);
  });

  it('narrows the library to the templates in the category its page slug names', () => {
    const { result } = renderHook(() => useTemplateLibrary('home-moving'));

    expect(shownIds(result.current.filteredTemplates)).toEqual(['moving-day']);
  });

  it('keeps the templates in any chosen category, and none without categories', () => {
    const { result } = renderHook(() => useTemplateLibrary());

    act(() => result.current.setSelectedCategories(['Travel', 'Home Moving']));

    expect(result.current.selectedCategories).toEqual(['Travel', 'Home Moving']);
    expect(shownIds(result.current.filteredTemplates)).toEqual(['moving-day', 'road-trip']);
  });

  it('finds the templates whose title, description or category holds the search, whatever its case', () => {
    const { result } = renderHook(() => useTemplateLibrary());

    act(() => result.current.setSearchQuery('PACK'));

    expect(result.current.searchQuery).toBe('PACK');
    expect(shownIds(result.current.filteredTemplates)).toEqual(['road-trip', 'packing-list', 'camp-weekend']);
  });

  it('applies the category page, the chosen categories and the search together', () => {
    catalog.templates = [roadTrip, publicTemplate('road-signs', 'Road Signs', { categories: ['Travel'] }), movingDay];
    const { result } = renderHook(() => useTemplateLibrary('travel'));

    act(() => {
      result.current.setSelectedCategories(['Travel']);
      result.current.setSearchQuery('night');
    });

    expect(shownIds(result.current.filteredTemplates)).toEqual(['road-trip']);
  });
});
