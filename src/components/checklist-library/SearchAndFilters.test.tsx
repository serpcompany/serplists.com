import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';

describe('SearchAndFilters', () => {
  it('renders the category chips above the discovery sort row', () => {
    const markup = renderToStaticMarkup(
      <SearchAndFilters
        categories={[
          { count: 2, name: 'Launch', slug: 'launch' },
          { count: 1, name: 'Security', slug: 'security' },
        ]}
        onCategoryChange={vi.fn()}
        onSortChange={vi.fn()}
        resultCount={8}
        selectedCategorySlug={null}
        sortBy="popular"
      />,
    );

    expect(markup).toContain('8 templates');
    expect(markup).toContain('All');
    expect(markup).toContain('Launch');
    expect(markup).toContain('Security');
    expect(markup).toContain('Popular');
    expect(markup).toContain('Trending');
    expect(markup).toContain('Recent');
    expect(markup.indexOf('Launch')).toBeLessThan(markup.indexOf('8 templates'));
    expect(markup).toContain('overflow-x-auto pb-2');
    expect(markup).toContain('justify-between');
    // The sort in use is pressed.
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Popular/);
  });
});
