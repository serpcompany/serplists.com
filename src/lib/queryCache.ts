import type { QueryClient } from '@tanstack/react-query';

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
