import { queryOptions } from '@tanstack/react-query';

import type { ChecklistTemplate } from '@/types/checklist';

import { loadTemplateDetailData } from './loadTemplateDetail';
import type { TemplateDetailApiClient } from './templateDetailApi';

/**
 * The private detail page's own template. The key sits under ['templates'], so every
 * template invalidation (editor saves, visibility, Share, copies, archive, context
 * switches) refetches it while the page is open, and the next write sends the version
 * the server holds. It has no Ownership Context: GET /api/templates/:id answers the
 * same in every context, and a context switch invalidates ['templates'] anyway.
 */
export const getTemplateDetailQueryKey = (
  identifier: string | undefined,
  userId: string | undefined,
) => ['templates', 'detail', identifier ?? 'none', userId ?? 'guest'] as const;

// Resolves to the template, or null when the server says it is gone. Any other failure
// throws, so a failed refresh keeps the loaded template and the page offers Try again.
export const buildTemplateDetailQueryOptions = (params: {
  apiClient?: TemplateDetailApiClient;
  identifier: string | undefined;
  userId: string | undefined;
}) =>
  queryOptions({
    queryKey: getTemplateDetailQueryKey(params.identifier, params.userId),
    queryFn: async (): Promise<ChecklistTemplate | null> => {
      const result = await loadTemplateDetailData(
        { identifier: params.identifier, mode: 'private' },
        { apiClient: params.apiClient },
      );

      if (result.kind === 'error') {
        throw new Error(result.message);
      }

      return result.kind === 'ok' ? result.template : null;
    },
    // A failure already says whether to retry; the page offers Try again.
    retry: false,
    // Invalidations keep it current. Returning to the tab is not a reason to fetch the
    // template again (the page would reload under an open dialog for nothing).
    refetchOnWindowFocus: false,
  });
