import type { QueryClient } from '@tanstack/react-query';

import { isStaleRecordError } from '@/lib/editConflicts';
import { dropTemplateHistory, markRunShared, refreshRunHistory, refreshTemplateHistory } from '@/lib/queryCache';
import { queryKindPrefix } from '@/lib/queryKeys';
import type { ChecklistTemplate } from '@/types/checklist';

// Marks every runs list stale and refetches only the ones a page is showing; the rest refetch
// when a page mounts them again. Never force-refetch inactive runs keys: an unobserved key keeps
// the queryFn (and `user`) of the render that last observed it, so after a sign-out and a
// sign-in in the same tab it would fetch the new session's runs into the old user's key.
export const refreshRunLists = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: ['runs'] });

const isContextListKey = (queryKey: readonly unknown[]): boolean =>
  (queryKey[0] === 'templates' && queryKey[1] !== 'catalog') || queryKey[0] === 'runs';

// A context switch runs in the click handler, before React re-renders, so the page's list
// observers are still on the old context's keys. Only mark the Template and Run lists stale:
// the new context's lists then load once when the page moves onto their keys (even if cached
// and fresh), and nothing refetches the context being left. The catalog is the same in every
// context, and selecting the context already selected changes nothing.
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

// The public catalog only refetches on pages that show it (and the edge cache can serve it for
// 5 more minutes), so remove a deleted Template from the cached copy right away.
export const dropTemplateFromCatalog = (queryClient: QueryClient, templateId: string): void => {
  queryClient.setQueryData<ChecklistTemplate[]>(['templates', 'catalog'], (catalog) =>
    catalog?.filter((template) => template.id !== templateId),
  );
};

// Deleting a Template or Run archives it, so it moves from its list to the archive page.
// Mark both stale for every user and context: the item may not belong to the active one.
// An archived Template's Changelog cannot be loaded, so it is dropped.
export const refreshAfterTemplateDelete = (queryClient: QueryClient, templateId: string): void => {
  dropTemplateFromCatalog(queryClient, templateId);
  dropTemplateHistory(queryClient, templateId);
  void queryClient.invalidateQueries({ queryKey: ['templates'] });
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedTemplates') });
};

// The PUT answer carries the version the next save needs, so a template save never waits for
// (or causes) a reload of the whole list: the Template lists are only marked stale and load
// when a page that shows them mounts. Run lists refresh only when the save changed the
// checklist structure, since only then were in-progress Runs of the template reconciled
// (describeTemplateUpdate), and the Template's open Changelogs because the save added a version.
export const refreshAfterTemplateSave = (
  queryClient: QueryClient,
  templateId: string,
  options: { runs?: boolean } = {},
): void => {
  void queryClient.invalidateQueries({ queryKey: ['templates'], refetchType: 'none' });
  if (options.runs ?? true) void refreshRunLists(queryClient);
  void refreshTemplateHistory(queryClient, templateId);
};

// Revalidating writes an audit event, so the run's Changelog refreshes with the lists.
export const refreshAfterRunRevalidated = async (queryClient: QueryClient, runId: string): Promise<void> => {
  await Promise.all([refreshRunLists(queryClient), refreshRunHistory(queryClient, runId)]);
};

// Sharing from the runs list writes an audit event ("Created share link") too, so the run's
// Changelog refreshes with the lists, as after a revalidate.
export const refreshAfterRunShared = async (queryClient: QueryClient, runId: string): Promise<void> => {
  await Promise.all([markRunShared(queryClient, runId), refreshRunHistory(queryClient, runId)]);
};

// A stale-record answer on revalidate means the cached list is out of date (the run was
// shared, changed, or archived elsewhere): reload it before the error reaches the page, so the
// button re-enables on the current revision (or disappears) instead of repeating the conflict.
export const refreshRunsAfterConflict = async (queryClient: QueryClient, error: unknown): Promise<void> => {
  if (isStaleRecordError(error)) await refreshRunLists(queryClient);
};

export const refreshAfterRunDelete = (queryClient: QueryClient): void => {
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedRuns') });
};
