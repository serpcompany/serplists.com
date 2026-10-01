import { queryOptions } from '@tanstack/react-query';

import type { ChecklistTemplate } from '@/types/checklist';

import { loadTemplateDetailData } from './loadTemplateDetail';
import type { TemplateDetailApiClient } from './templateDetailApi';

export const getTemplateDetailQueryKey = (
  identifier: string | undefined,
  userId: string | undefined,
) => ['templates', 'detail', identifier ?? 'none', userId ?? 'guest'] as const;

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
    retry: false,
    refetchOnWindowFocus: false,
  });
