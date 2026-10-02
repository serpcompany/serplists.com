import type { QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/lib/api-errors';
import { isStaleRecordError } from '@/lib/editConflicts';
import {
  isTemplatePageOf,
  markArchivedTemplateStale,
  markRunShared,
  refreshRunHistory,
  refreshTemplateHistory,
} from '@/lib/queryCache';
import { queryKindPrefix } from '@/lib/queryKeys';
import type { ChecklistTemplate } from '@/types/checklist';

export const refreshRunLists = (queryClient: Pick<QueryClient, 'invalidateQueries'>): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: ['runs'] });

const isCatalogKey = (queryKey: readonly unknown[]): boolean =>
  queryKey[0] === 'templates' && queryKey[1] === 'catalog';

const isContextListKey = (queryKey: readonly unknown[]): boolean =>
  (queryKey[0] === 'templates' && !isCatalogKey(queryKey)) || queryKey[0] === 'runs';

export const markListsStaleForWorkspaceSwitch = (
  queryClient: QueryClient,
  change: { fromWorkspaceId: string; toWorkspaceId: string },
): void => {
  if (change.fromWorkspaceId === change.toWorkspaceId) return;
  void queryClient.invalidateQueries({
    predicate: (query) => isContextListKey(query.queryKey),
    refetchType: 'none',
  });
};

export const dropTemplateFromCatalog = (queryClient: QueryClient, templateId: string): void => {
  queryClient.setQueryData<ChecklistTemplate[]>(['templates', 'catalog'], (catalog) =>
    catalog?.filter((template) => template.id !== templateId),
  );
};

export const refreshAfterTemplateDelete = (queryClient: QueryClient, templateId: string): void => {
  dropTemplateFromCatalog(queryClient, templateId);
  void queryClient.invalidateQueries({
    queryKey: ['templates'],
    predicate: (query) => !isCatalogKey(query.queryKey) && !isTemplatePageOf(query, templateId),
  });
  void markArchivedTemplateStale(queryClient, templateId);
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedTemplates') });
};

export const refreshAfterTemplateSave = (
  queryClient: QueryClient,
  templateId: string,
  options: { runs?: boolean } = {},
): void => {
  void queryClient.invalidateQueries({ queryKey: ['templates'], refetchType: 'none' });
  if (options.runs ?? true) void refreshRunLists(queryClient);
  void refreshTemplateHistory(queryClient, templateId);
};

export const refreshAfterRunRevalidated = async (queryClient: QueryClient, runId: string): Promise<void> => {
  await Promise.all([refreshRunLists(queryClient), refreshRunHistory(queryClient, runId)]);
};

export const refreshAfterRunShared = async (queryClient: QueryClient, runId: string): Promise<void> => {
  await Promise.all([markRunShared(queryClient, runId), refreshRunHistory(queryClient, runId)]);
};

export const refreshRunsAfterConflict = async (
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  error: unknown,
): Promise<void> => {
  if (isStaleRecordError(error)) await refreshRunLists(queryClient);
};

export const refreshTemplatesAfterConflict = async (
  queryClient: QueryClient,
  error: unknown,
  templateId: string,
): Promise<void> => {
  if (!isStaleRecordError(error)) return;
  if (isApiError(error) && error.status === 404) dropTemplateFromCatalog(queryClient, templateId);
  await queryClient.invalidateQueries({
    queryKey: ['templates'],
    predicate: (query) => !isCatalogKey(query.queryKey),
  });
};

export const refreshAfterRunDelete = (queryClient: QueryClient): void => {
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedRuns') });
};
