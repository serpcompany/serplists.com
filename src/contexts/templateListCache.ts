import type { QueryClient } from '@tanstack/react-query';

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
export const refreshAfterTemplateDelete = (queryClient: QueryClient, templateId: string): void => {
  dropTemplateFromCatalog(queryClient, templateId);
  void queryClient.invalidateQueries({ queryKey: ['templates'] });
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedTemplates') });
};

export const refreshAfterRunDelete = (queryClient: QueryClient): void => {
  void refreshRunLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKindPrefix('archivedRuns') });
};
