import type { Query, QueryClient } from '@tanstack/react-query';

// Query keys shared by the queries that read them and the saves that make them stale.
export const queryKeys = {
  runs: ['runs'] as const,
  templates: ['templates'] as const,
  // A run's Changelog (GET /api/checklists/:id/history).
  runHistory: (runId: string) => ['checklist-run-history', runId] as const,
  // Every cached Changelog of a Template, whoever loaded it: the prefix saves refresh. It sits
  // under ['templates'], so every Template list invalidation refreshes the Changelog too.
  templateHistory: (templateId: string) => ['templates', 'history', templateId] as const,
  templateHistoryFor: (templateId: string, userId?: string, teamId?: string) =>
    ['templates', 'history', templateId, userId ?? 'guest', teamId ?? 'personal'] as const,
};

// Each save writes an audit event (and a Template save a version), but the Changelogs stay
// fresh for 60s, so saves refresh them explicitly (the list refreshes in
// src/contexts/templateListCache.ts call these).

export const refreshRunHistory = (queryClient: QueryClient, runId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.runHistory(runId) });

export const refreshTemplateHistory = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.templateHistory(templateId) });

// A cached detail page (src/features/template-detail/templateDetailQuery.ts), keyed
// ['templates', 'detail', <route identifier>, <user>]. It holds null once the server said
// the template is gone.
export const isTemplateDetailQuery = (query: Query): boolean =>
  query.queryKey[0] === 'templates' && query.queryKey[1] === 'detail';

// One Template's detail pages, for every user. The route identifier can be a slug, so a
// loaded entry also matches by its template's id.
export const isTemplateDetailOf = (query: Query, templateId: string): boolean => {
  if (!isTemplateDetailQuery(query)) return false;
  const data: unknown = query.state.data;
  return (
    query.queryKey[2] === templateId ||
    (typeof data === 'object' && data !== null && 'id' in data && data.id === templateId)
  );
};

// One Template's own pages: its detail entries and its Changelogs.
export const isTemplatePageOf = (query: Query, templateId: string): boolean =>
  isTemplateDetailOf(query, templateId) ||
  (query.queryKey[0] === 'templates' && query.queryKey[1] === 'history' && query.queryKey[2] === templateId);

// An archived Template's own pages can only answer 404. They are marked stale without a
// refetch: the detail page may still be open while the delete settles, and a refetch (or
// removing a query it observes, which fetches it again) would cache that 404 as "not
// found" for the next visit, even after a restore.
export const markArchivedTemplateStale = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({
    predicate: (query) => isTemplatePageOf(query, templateId),
    refetchType: 'none',
  });

// Sharing makes a run public on the server, and a public run cannot be revalidated. Mark it
// in every cached runs list (Personal and each Organization) right away, then reload them.
export const markRunShared = (queryClient: QueryClient, runId: string) => {
  queryClient.setQueriesData<Array<{ id: string; isPublic?: boolean }>>({ queryKey: queryKeys.runs }, (runs) =>
    runs?.map((run) => (run.id === runId ? { ...run, isPublic: true } : run)),
  );
  return queryClient.invalidateQueries({ queryKey: queryKeys.runs });
};
