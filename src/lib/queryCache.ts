import type { Query, QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  runs: ['runs'] as const,
  templates: ['templates'] as const,
  runHistory: (runId: string) => ['checklist-run-history', runId] as const,
  everyTemplateHistory: (templateId: string) => ['templates', 'history', templateId] as const,
  templateHistoryFor: (templateId: string, userId?: string, teamId?: string) =>
    ['templates', 'history', templateId, userId ?? 'guest', teamId ?? 'personal'] as const,
  templateDetail: (identifier: string | undefined, userId: string | undefined) =>
    ['templates', 'detail', identifier ?? 'none', userId ?? 'guest'] as const,
};

export const refreshRunHistory = (queryClient: Pick<QueryClient, 'invalidateQueries'>, runId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.runHistory(runId) });

export const refreshTemplateHistory = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.everyTemplateHistory(templateId) });

export const isTemplateDetailQuery = (query: Query): boolean =>
  query.queryKey[0] === 'templates' && query.queryKey[1] === 'detail';

const detailRouteIdentifier = (query: Query): unknown => query.queryKey[2];

const loadedTemplateId = (query: Query): unknown => {
  const data: unknown = query.state.data;
  return typeof data === 'object' && data !== null && 'id' in data ? data.id : undefined;
};

export const isTemplateDetailOf = (query: Query, templateId: string): boolean =>
  isTemplateDetailQuery(query) &&
  (detailRouteIdentifier(query) === templateId || loadedTemplateId(query) === templateId);

const isTemplateHistoryOf = (query: Query, templateId: string): boolean =>
  query.queryKey[0] === 'templates' && query.queryKey[1] === 'history' && query.queryKey[2] === templateId;

export const isTemplatePageOf = (query: Query, templateId: string): boolean =>
  isTemplateDetailOf(query, templateId) || isTemplateHistoryOf(query, templateId);

export const markArchivedTemplateStale = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({
    predicate: (query) => isTemplatePageOf(query, templateId),
    refetchType: 'none',
  });

export const markRunShared = (queryClient: QueryClient, runId: string) => {
  queryClient.setQueriesData<Array<{ id: string; isPublic?: boolean }>>({ queryKey: queryKeys.runs }, (runs) =>
    runs?.map((run) => (run.id === runId ? { ...run, isPublic: true } : run)),
  );
  return queryClient.invalidateQueries({ queryKey: queryKeys.runs });
};
