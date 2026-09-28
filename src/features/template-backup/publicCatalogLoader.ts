import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  CATALOG_QUERY_KEY,
  createTemplateListFetcher,
  shouldRetryListFetch,
} from '@/contexts/templateListFetchers';
import { api } from '@/lib/api';
import type { ChecklistTemplate } from '@/types/checklist';

// The same query the discovery pages read (buildTemplateListQueries in TemplatesContext): edge
// cached and keyed without a user, so a catalog they already loaded is reused.
const catalogQuery = {
  queryKey: CATALOG_QUERY_KEY,
  queryFn: createTemplateListFetcher(api)({ scope: 'public' }),
  staleTime: 5 * 60 * 1000,
  retry: shouldRetryListFetch,
};

/**
 * Loads the public catalog for one action (an export that includes public templates)
 * without subscribing the page to it, so the Import Templates page never loads the
 * catalog just by opening.
 */
export const usePublicCatalogLoader = (): (() => Promise<ChecklistTemplate[]>) => {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.fetchQuery(catalogQuery), [queryClient]);
};
