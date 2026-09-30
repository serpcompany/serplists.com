import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryChips, SortButtons } from '@/components/checklist-library/SearchAndFilters';
import { navigation } from '../../../tests/support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../tests/support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../tests/support/nextNavigation')).nextLinkMock);

beforeEach(() => {
  navigation.reset('/templates/');
});

const categories = [
  { count: 2, name: 'Launch', slug: 'launch' },
  { count: 1, name: 'Security', slug: 'security' },
];

describe('CategoryChips', () => {
  it('offers All, then each category, with the selected one filled', () => {
    const markup = renderToStaticMarkup(
      <CategoryChips categories={categories} onCategoryChange={vi.fn()} selectedCategorySlug="security" />,
    );

    expect(markup.indexOf('>All<')).toBeLessThan(markup.indexOf('Launch'));
    expect(markup.indexOf('Launch')).toBeLessThan(markup.indexOf('Security'));
    expect(markup).toMatch(/<button[^>]*class="[^"]*bg-secondary[^"]*"[^>]*>Launch<\/button>/);
    expect(markup).toMatch(/<button[^>]*class="[^"]*bg-primary[^"]*"[^>]*>Security<\/button>/);
  });

  it('links a category chip to its page when there is one', () => {
    const markup = renderToStaticMarkup(
      <CategoryChips
        categories={categories}
        getCategoryPath={(category) => `/categories/${category.slug}/`}
        onCategoryChange={vi.fn()}
        selectedCategorySlug={null}
      />,
    );

    expect(markup).toContain('href="/categories/launch/"');
    expect(markup).toContain('href="/categories/security/"');
    expect(markup).toMatch(/<button[^>]*>All<\/button>/);
  });
});

describe('SortButtons', () => {
  it('offers Popular, Trending and Recent, and presses the sort in use', () => {
    const markup = renderToStaticMarkup(<SortButtons onSortChange={vi.fn()} sortBy="popular" />);

    expect(markup).toContain('Popular');
    expect(markup).toContain('Trending');
    expect(markup).toContain('Recent');
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Popular/);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
