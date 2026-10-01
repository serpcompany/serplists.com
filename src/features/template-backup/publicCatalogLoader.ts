import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  CATALOG_QUERY_KEY,
  createTemplateListFetcher,
  shouldRetryListFetch,
} from '@/contexts/templateListFetchers';
import { api } from '@/lib/api';
import type { ChecklistTemplate } from '@/types/checklist';

const catalogQuery = {
  queryKey: CATALOG_QUERY_KEY,
  queryFn: createTemplateListFetcher(api)({ scope: 'public' }),
  staleTime: 5 * 60 * 1000,
  retry: shouldRetryListFetch,
};

export const usePublicCatalogLoader = (): (() => Promise<ChecklistTemplate[]>) => {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.fetchQuery(catalogQuery), [queryClient]);
};
