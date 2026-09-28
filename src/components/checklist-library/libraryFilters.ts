import { z } from 'zod';

import type { DiscoverySort } from '@/components/checklist-library/discovery-utils';
import { resolveLegacyTemplatesCategoryRedirectPath } from '@/lib/routes';

/**
 * Filters for the /templates library. The URL is their only source: the page stays
 * mounted when a link or Back/Forward changes the URL, so filters kept in component
 * state would go stale.
 */
export interface LibraryFilters {
  categorySlug: string | null;
  query: string;
  sort: DiscoverySort;
}

export const DEFAULT_LIBRARY_SORT: DiscoverySort = 'popular';

export const parseLibrarySort = (value: string | null): DiscoverySort =>
  value === 'recent' || value === 'trending' || value === 'popular'
    ? value
    : DEFAULT_LIBRARY_SORT;

export const readLibraryFilters = (searchParams: URLSearchParams): LibraryFilters => ({
  categorySlug: searchParams.get('category')?.trim() || null,
  query: searchParams.get('search')?.trim() ?? '',
  sort: parseLibrarySort(searchParams.get('sort')),
});

export const buildLibraryFilterParams = ({
  categorySlug,
  query,
  sort,
}: LibraryFilters): URLSearchParams => {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (categorySlug) params.set('category', categorySlug);
  if (normalizedQuery) params.set('search', normalizedQuery);
  if (sort !== DEFAULT_LIBRARY_SORT) params.set('sort', sort);
  return params;
};

/** History state on the entries the library writes itself while the user edits filters. */
export const LIBRARY_FILTER_UPDATE_STATE = { libraryFilterUpdate: true } as const;

const libraryFilterUpdateStateSchema = z.object({ libraryFilterUpdate: z.literal(true) });

/**
 * The legacy /templates?category=x link redirects to /categories/x. It applies only to
 * URLs that arrive from elsewhere: clearing the search on ?category=x&search=y writes
 * ?category=x, and that must not pull the user off the page mid-edit.
 */
export const resolveLibraryLegacyRedirect = (
  searchParams: URLSearchParams,
  locationState: unknown,
): string | null =>
  libraryFilterUpdateStateSchema.safeParse(locationState).success
    ? null
    : resolveLegacyTemplatesCategoryRedirectPath(searchParams);

/**
 * The search box keeps the raw text (the URL holds it trimmed, so a trailing space
 * would vanish while typing) and follows the URL when the URL's search changes to
 * something the box does not already say: a link, Back/Forward, or a pasted URL.
 */
export interface SearchDraftState {
  draft: string;
  syncedQuery: string;
}

export const syncSearchDraft = (
  state: SearchDraftState,
  urlQuery: string,
): SearchDraftState => {
  if (urlQuery === state.syncedQuery) return state;
  return {
    draft: state.draft.trim() === urlQuery ? state.draft : urlQuery,
    syncedQuery: urlQuery,
  };
};
