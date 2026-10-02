import { z } from 'zod';

import type { DiscoverySort } from '@/components/checklist-library/discovery-utils';
import { resolveLegacyTemplatesCategoryRedirectPath } from '@/lib/routes';

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

export const LIBRARY_FILTER_UPDATE_STATE = { libraryFilterUpdate: true } as const;

const libraryFilterUpdateStateSchema = z.object({ libraryFilterUpdate: z.literal(true) });

export const resolveLibraryLegacyRedirect = (
  searchParams: URLSearchParams,
  locationState: unknown,
): string | null =>
  libraryFilterUpdateStateSchema.safeParse(locationState).success
    ? null
    : resolveLegacyTemplatesCategoryRedirectPath(searchParams);

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
