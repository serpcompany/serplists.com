import { describe, expect, it } from 'vitest';

import {
  LIBRARY_FILTER_UPDATE_STATE,
  buildLibraryFilterParams,
  readLibraryFilters,
  resolveLibraryLegacyRedirect,
  syncSearchDraft,
} from '@/components/checklist-library/libraryFilters';

const params = (search: string) => new URLSearchParams(search);

describe('readLibraryFilters', () => {
  it('reads every filter from the URL', () => {
    expect(readLibraryFilters(params('?category=moving&search=box&sort=recent'))).toEqual({
      categorySlug: 'moving',
      query: 'box',
      sort: 'recent',
    });
  });

  it('falls back to no filters and the popular sort', () => {
    expect(readLibraryFilters(params(''))).toEqual({
      categorySlug: null,
      query: '',
      sort: 'popular',
    });
    expect(readLibraryFilters(params('?sort=oldest&category=%20&search=%20%20')).sort).toBe(
      'popular',
    );
    expect(readLibraryFilters(params('?category=%20&search=%20%20'))).toMatchObject({
      categorySlug: null,
      query: '',
    });
  });
});

describe('buildLibraryFilterParams', () => {
  it('trims the search and leaves out empty filters and the default sort', () => {
    expect(
      buildLibraryFilterParams({ categorySlug: null, query: '   ', sort: 'popular' }).toString(),
    ).toBe('');
    expect(
      buildLibraryFilterParams({ categorySlug: 'moving', query: ' box set ', sort: 'recent' })
        .toString(),
    ).toBe('category=moving&search=box+set&sort=recent');
  });
});

describe('resolveLibraryLegacyRedirect, only for ?category= links from outside the page', () => {
  it('still redirects an incoming category-only link to the category page', () => {
    expect(resolveLibraryLegacyRedirect(params('?category=moving'), null)).toBe(
      '/categories/moving/',
    );
    expect(resolveLibraryLegacyRedirect(params('?category=Technical%20SEO'), undefined)).toBe(
      '/categories/technical-seo/',
    );
    expect(
      resolveLibraryLegacyRedirect(params('?category=moving'), { from: '/somewhere' }),
    ).toBe('/categories/moving/');
  });

  it('does not redirect a category-only URL the library wrote itself, as clearing the search on ?category=moving&search=box does', () => {
    expect(
      resolveLibraryLegacyRedirect(params('?category=moving'), LIBRARY_FILTER_UPDATE_STATE),
    ).toBeNull();
  });

  it('keeps a category combined with other filters on the library', () => {
    expect(resolveLibraryLegacyRedirect(params('?category=moving&sort=recent'), null)).toBeNull();
  });
});

describe('syncSearchDraft, which follows the URL while /templates stays mounted through links and Back/Forward', () => {
  it('keeps what the user typed, including a trailing space, while the URL agrees', () => {
    const typed = { draft: 'box ', syncedQuery: 'box' };
    expect(syncSearchDraft(typed, 'box')).toBe(typed);

    const next = syncSearchDraft({ draft: 'box s', syncedQuery: 'box' }, 'box s');
    expect(next).toEqual({ draft: 'box s', syncedQuery: 'box s' });
  });

  it('empties the search box when a link goes back to a plain /templates', () => {
    expect(syncSearchDraft({ draft: 'foo', syncedQuery: 'foo' }, '')).toEqual({
      draft: '',
      syncedQuery: '',
    });
  });

  it('follows Back and Forward to another search', () => {
    expect(syncSearchDraft({ draft: 'bar', syncedQuery: 'bar' }, 'foo')).toEqual({
      draft: 'foo',
      syncedQuery: 'foo',
    });
  });

  it('keeps a whitespace-only draft after the page drops the empty search', () => {
    expect(syncSearchDraft({ draft: '  ', syncedQuery: 'foo' }, '')).toEqual({
      draft: '  ',
      syncedQuery: '',
    });
  });
});
