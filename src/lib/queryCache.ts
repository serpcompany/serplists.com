import type { QueryClient } from '@tanstack/react-query';

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

export const refreshRunHistory = (queryClient: Pick<QueryClient, 'invalidateQueries'>, runId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.runHistory(runId) });

export const refreshTemplateHistory = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.templateHistory(templateId) });

// An archived Template's history cannot be loaded, so it is dropped rather than refetched.
export const dropTemplateHistory = (queryClient: QueryClient, templateId: string) =>
  queryClient.removeQueries({ queryKey: queryKeys.templateHistory(templateId) });

// Sharing makes a run public on the server, and a public run cannot be revalidated. Mark it
// in every cached runs list (Personal and each Organization) right away, then reload them.
// The run page's Share calls this alone, since its saver refreshes the open Changelog; the
// runs list's Share uses refreshAfterRunShared (src/contexts/templateListCache.ts).
export const markRunShared = (queryClient: QueryClient, runId: string) => {
  queryClient.setQueriesData<Array<{ id: string; isPublic?: boolean }>>({ queryKey: queryKeys.runs }, (runs) =>
    runs?.map((run) => (run.id === runId ? { ...run, isPublic: true } : run)),
  );
  return queryClient.invalidateQueries({ queryKey: queryKeys.runs });
};
