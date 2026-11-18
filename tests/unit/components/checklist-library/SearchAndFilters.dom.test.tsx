import { navigation } from '../../../support/mockedNextNavigation';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryChips, SortButtons } from '@/components/checklist-library/SearchAndFilters';
import type { DiscoveryCategory } from '@/components/checklist-library/discovery-utils';

import { renderSettled } from '../../../support/renderInTheDom';

const categories: DiscoveryCategory[] = [
  { count: 3, name: 'Marketing', slug: 'marketing' },
  { count: 1, name: 'Travel', slug: 'travel' },
];

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

beforeEach(() => {
  navigation.reset('/templates/');
});

describe('the category chips of the library', () => {
  it('chooses a category, or all of them, on a tap', async () => {
    const onCategoryChange = vi.fn();
    await renderSettled(<CategoryChips categories={categories} onCategoryChange={onCategoryChange} selectedCategorySlug="travel" />);

    await press('Marketing');
    await press('All');

    expect(onCategoryChange.mock.calls).toEqual([['marketing'], [null]]);
  });

  it('shows nothing when no category has a Template', async () => {
    const { container } = await renderSettled(<CategoryChips categories={[]} onCategoryChange={vi.fn()} selectedCategorySlug={null} />);

    expect(container.innerHTML).toBe('');
  });
});

describe('the sort buttons of the library', () => {
  it('marks the current sort pressed and changes the sort on a tap', async () => {
    const onSortChange = vi.fn();
    await renderSettled(<SortButtons onSortChange={onSortChange} sortBy="popular" />);

    expect(screen.getByRole('button', { name: 'Popular' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Trending' }).getAttribute('aria-pressed')).toBe('false');

    await press('Trending');
    await press('Recent');

    expect(onSortChange.mock.calls).toEqual([['trending'], ['recent']]);
  });
});
