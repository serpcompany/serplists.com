import type { QueryClient } from '@tanstack/react-query';

import { isApiError } from '@/lib/api-errors';

// Query keys shared by the queries that read them and the saves that make them stale.
export const queryKeys = {
  runs: ['runs'] as const,
  templates: ['templates'] as const,
  // A run's Changelog (GET /api/checklists/:id/history).
  runHistory: (runId: string) => ['checklist-run-history', runId] as const,
  // Every cached Changelog of a Template, whoever loaded it: the prefix saves refresh.
  templateHistory: (templateId: string) => ['template-history', templateId] as const,
  templateHistoryFor: (templateId: string, userId?: string, teamId?: string) =>
    ['template-history', templateId, userId ?? 'guest', teamId ?? 'personal'] as const,
};

// Each save writes an audit event (and a Template save a version), but the Changelogs stay
// fresh for 60s, so the saves below refresh them explicitly.

export const refreshRunHistory = (queryClient: QueryClient, runId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.runHistory(runId) });

export const refreshTemplateHistory = (queryClient: QueryClient, templateId: string) =>
  queryClient.invalidateQueries({ queryKey: queryKeys.templateHistory(templateId) });

// A Template save also reconciles its active runs.
export const refreshAfterTemplateSave = (queryClient: QueryClient, templateId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
    queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
    refreshTemplateHistory(queryClient, templateId),
  ]);

// An archived Template's history cannot be loaded, so it is dropped rather than refetched.
export const refreshAfterTemplateArchived = (queryClient: QueryClient, templateId: string) => {
  queryClient.removeQueries({ queryKey: queryKeys.templateHistory(templateId) });
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
    queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
  ]);
};

export const refreshAfterRunRevalidated = async (queryClient: QueryClient, runId: string) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
    refreshRunHistory(queryClient, runId),
  ]);
  await queryClient.refetchQueries({ queryKey: queryKeys.runs });
};

// Sharing makes a run public on the server, and a public run cannot be revalidated. Mark it
// in every cached runs list (Personal and each Organization) right away, then reload them.
export const markRunShared = (queryClient: QueryClient, runId: string) => {
  queryClient.setQueriesData<Array<{ id: string; isPublic?: boolean }>>({ queryKey: queryKeys.runs }, (runs) =>
    runs?.map((run) => (run.id === runId ? { ...run, isPublic: true } : run)),
  );
  return queryClient.invalidateQueries({ queryKey: queryKeys.runs });
};

// A 409 on revalidate means the cached list is out of date (the run was shared or changed
// in another tab or by another Organization member): reload it so the row stops offering
// an action that cannot work.
export const refreshRunsAfterConflict = async (queryClient: QueryClient, error: unknown) => {
  if (isApiError(error) && error.status === 409) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.runs });
  }
};
