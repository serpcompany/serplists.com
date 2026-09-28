import type { QueryClient } from '@tanstack/react-query';

import type { ChecklistTemplate } from '@/types/checklist';

// Marks every runs list stale and refetches only the ones a page is showing; the rest refetch
// when a page mounts them again. Never force-refetch inactive runs keys: an unobserved key keeps
// the queryFn (and `user`) of the render that last observed it, so after a sign-out and a
// sign-in in the same tab it would fetch the new session's runs into the old user's key.
export const refreshRunLists = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: ['runs'] });

// The public catalog only refetches on pages that show it (and the edge cache can serve it for
// 5 more minutes), so remove a deleted Template from the cached copy right away.
export const dropTemplateFromCatalog = (queryClient: QueryClient, templateId: string): void => {
  queryClient.setQueryData<ChecklistTemplate[]>(['templates', 'catalog'], (catalog) =>
    catalog?.filter((template) => template.id !== templateId),
  );
};
